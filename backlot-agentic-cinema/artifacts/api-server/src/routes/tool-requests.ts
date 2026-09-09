import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { transform } from "esbuild";
import { BuildToolRequestParams, BuildToolRequestResponse, CreateToolRequestBody, CreateToolRequestResponse, GenerateGroundedSpecBody, GenerateGroundedSpecParams, GenerateGroundedSpecResponse, GroundToolRequestBody, GroundToolRequestResponse, ListToolRequestsResponse, PublishToolRequestParams, PublishToolRequestResponse } from "@workspace/api-zod";
import { db, toolRequestsTable } from "@workspace/db";
import { generateVertexContent } from "../lib/vertex";

const router: IRouter = Router();
export const publishedToolsRouter: IRouter = Router();

function serializeToolRequest(row: typeof toolRequestsTable.$inferSelect) {
  const storedSpec = row.specJson as Record<string, unknown> | null;
  const spec = storedSpec
    ? {
        ...storedSpec,
        mode: storedSpec.mode === "interactive" ? "interactive" : "production",
        initialData: Array.isArray(storedSpec.initialData) ? storedSpec.initialData : [],
        interactive: storedSpec.mode === "interactive" ? storedSpec.interactive ?? null : null,
      }
    : null;
  return {
    id: row.id,
    requestText: row.requestText,
    spec,
    groundedFacts: row.groundedFacts,
    sourcePdfName: row.sourcePdfName,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    generatedCode: row.generatedCode,
    supervisorStatus: row.supervisorStatus,
    supervisorReason: row.supervisorReason,
    publishedUrl: row.publishedUrl,
    publishedSlug: row.publishedSlug,
  };
}

function slugifyToolName(name: string) {
  return name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "production-tool";
}

const toolSpecShape = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING", description: "A concise, memorable name for the internal production tool." },
    mode: { type: "STRING", enum: ["production", "interactive"] },
    purpose: { type: "STRING", description: "One sentence explaining what the tool helps the production team do." },
    fields: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          type: { type: "STRING", description: "A practical field type such as text, number, date, status, boolean, or person." },
          description: { type: "STRING" },
        },
        required: ["name", "type", "description"],
      },
    },
    actions: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          label: { type: "STRING" },
          description: { type: "STRING" },
        },
        required: ["label", "description"],
      },
    },
    initialData: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          sourceType: { type: "STRING" },
          name: { type: "STRING" },
          details: { type: "STRING" },
        },
        required: ["sourceType", "name", "details"],
      },
    },
    interactive: {
      type: "OBJECT",
      nullable: true,
      properties: {
        mechanic: { type: "STRING", enum: ["match", "branch"] },
        entities: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: {
              sourceType: { type: "STRING" },
              name: { type: "STRING" },
              details: { type: "STRING" },
            },
            required: ["sourceType", "name", "details"],
          },
        },
        winCondition: { type: "STRING" },
        instructions: { type: "STRING" },
      },
      required: ["mechanic", "entities", "winCondition", "instructions"],
    },
  },
  required: ["name", "mode", "purpose", "fields", "actions", "initialData", "interactive"],
};

const groundedFactsShape = {
  type: "OBJECT",
  properties: {
    characters: { type: "ARRAY", items: { type: "STRING" } },
    scenes: { type: "ARRAY", items: { type: "STRING" } },
    props: { type: "ARRAY", items: { type: "STRING" } },
    locations: { type: "ARRAY", items: { type: "STRING" } },
    rightsMentions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["characters", "scenes", "props", "locations", "rightsMentions"],
};

async function generateSpec(requestText: string, groundedFacts?: unknown, mode: "production" | "interactive" = "production") {
  const modeInstruction = mode === "interactive"
    ? `Create a single-screen minimalist interactive experience. Choose exactly ONE mechanic from this fixed list only:
- match: match grounded props or characters to their correct real scene or location
- branch: a 2-3 choice decision game using real character names and scenes
Set mode to interactive. Populate interactive with the chosen mechanic, only real grounded entities, concise instructions, and a concrete reachable win/end condition. Use initialData for those same real entities.`
    : "Create a production-office utility. Set mode to production and interactive to null.";
  return JSON.parse(await generateVertexContent({
    contents: [{ role: "user", parts: [{ text: `You are Backlot, an AI production assistant. ${modeInstruction} Include 4-8 useful fields and 2-4 actions. ${groundedFacts ? "Use the reviewed grounded facts and actual document entities, never generic examples or placeholders." : "There is no source document; return an empty initialData array."}\n\nRequest: ${requestText}\n\nGrounded facts: ${groundedFacts ? JSON.stringify(groundedFacts) : "none"}` }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: toolSpecShape, temperature: 0.2 },
  }));
}

router.get("/tool-requests", async (req, res) => {
  const rows = await db.select().from(toolRequestsTable).orderBy(desc(toolRequestsTable.createdAt));
  const payload = rows.map(serializeToolRequest);
  res.json(ListToolRequestsResponse.parse(payload));
});

router.post("/tool-requests", async (req, res) => {
  const parsed = CreateToolRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please describe the production tool you need." });
    return;
  }

  try {
    const spec = await generateSpec(parsed.data.requestText);
    const [row] = await db.insert(toolRequestsTable).values({
      requestText: parsed.data.requestText,
      specJson: spec,
      status: "spec-ready",
    }).returning();

    const payload = serializeToolRequest(row);
    res.status(201).json(CreateToolRequestResponse.parse(payload));
  } catch (error) {
    req.log.error({ err: error }, "Tool request generation failed");
    res.status(500).json({ error: "We couldn't generate that spec. Please try again." });
  }
});

router.post("/tool-requests/ground", async (req, res) => {
  const parsed = GroundToolRequestBody.safeParse(req.body);
  if (!parsed.success || !parsed.data.pdfName.toLowerCase().endsWith(".pdf")) {
    res.status(400).json({ error: "Choose a valid PDF and describe the production tool you need." });
    return;
  }
  try {
    const groundedFacts = JSON.parse(await generateVertexContent({
      contents: [{ role: "user", parts: [
        { text: "Read this production document natively as a PDF. Extract concise, document-grounded characters, scenes, props, locations, and every song, brand, trademark, artwork, clip, quotation, or other rights/clearance mention. Do not invent facts. Return only JSON." },
        { inlineData: { mimeType: "application/pdf", data: parsed.data.pdfBase64 } },
      ] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: groundedFactsShape, temperature: 0 },
    }));
    const [row] = await db.insert(toolRequestsTable).values({
      requestText: parsed.data.requestText,
      groundedFacts,
      sourcePdfName: parsed.data.pdfName,
      status: "facts-ready",
    }).returning();
    res.status(201).json(GroundToolRequestResponse.parse(serializeToolRequest(row)));
  } catch (error) {
    req.log.error({ err: error }, "Vertex PDF grounding failed");
    res.status(500).json({ error: "Backlot couldn’t read that PDF. Please try again with a clear, text-readable production document." });
  }
});

router.post("/tool-requests/:id/spec", async (req, res) => {
  const parsed = GenerateGroundedSpecParams.safeParse({ id: Number(req.params.id) });
  const parsedBody = GenerateGroundedSpecBody.safeParse(req.body);
  if (!parsed.success || !parsedBody.success) { res.status(400).json({ error: "Choose Production or Interactive mode." }); return; }
  const [request] = await db.select().from(toolRequestsTable).where(eq(toolRequestsTable.id, parsed.data.id)).limit(1);
  if (!request) { res.status(404).json({ error: "Tool request not found." }); return; }
  if (request.status !== "facts-ready" || !request.groundedFacts) {
    res.status(409).json({ error: "Grounded facts are not ready for specification generation." }); return;
  }
  try {
    const spec = await generateSpec(request.requestText, request.groundedFacts, parsedBody.data.mode);
    const [row] = await db.update(toolRequestsTable).set({ specJson: spec, status: "spec-ready" }).where(eq(toolRequestsTable.id, request.id)).returning();
    res.json(GenerateGroundedSpecResponse.parse(serializeToolRequest(row)));
  } catch (error) {
    req.log.error({ err: error }, "Grounded specification generation failed");
    res.status(500).json({ error: "Backlot couldn’t prepare the tool plan. Please try again." });
  }
});

router.post("/tool-requests/:id/build", async (req, res) => {
  const parsedParams = BuildToolRequestParams.safeParse({ id: Number(req.params.id) });
  if (!parsedParams.success || !Number.isInteger(parsedParams.data.id)) {
    res.status(404).json({ error: "Tool request not found." });
    return;
  }

  const [request] = await db.select().from(toolRequestsTable).where(eq(toolRequestsTable.id, parsedParams.data.id)).limit(1);
  if (!request) {
    res.status(404).json({ error: "Tool request not found." });
    return;
  }
  if (!["spec-ready", "validation-failed"].includes(request.status) || !request.specJson) {
    res.status(409).json({ error: "Only reviewed specs can be built." });
    return;
  }

  try {
    const spec = request.specJson as { mode?: string; interactive?: { mechanic?: string; winCondition?: string } };
    const isInteractive = spec.mode === "interactive";
    const buildInstruction = isInteractive
      ? `Generate a polished single-screen minimalist 2D interactive component using DOM and/or Canvas. No 3D, physics, or generated/external assets. Implement exactly the ${spec.interactive?.mechanic} mechanic and its reachable end condition. Every displayed character, prop, scene, and location must use real names/data from the spec—no generic placeholder labels. Show clear player instructions, progress/feedback, restart, and an explicit win/end screen. All visible wording must address the player in everyday language; never mention components, DOM, Canvas, code, state, APIs, generation, specifications, validation, or other developer concepts.`
      : "Generate a polished production-office utility.";
    const rawCode = await generateVertexContent({
      contents: [{ role: "user", parts: [{ text: `You are Backlot's component generator. ${buildInstruction} Generate one self-contained React component for this approved spec. Return ONLY source code. Name it GeneratedTool and default export it. Use React useState/useEffect only, local state, plain JSX, standard browser APIs, and inline styles. Include every field/action and initialize with every specified entity. No imports, routing, network calls, localStorage, eval, dangerouslySetInnerHTML, or external packages.\n\nApproved spec:\n${JSON.stringify(request.specJson)}\n\nGrounded facts:\n${JSON.stringify(request.groundedFacts ?? null)}` }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 16384 },
    });
    const generatedCode = rawCode.replace(/^```(?:tsx|jsx|javascript|js)?\s*/i, "").replace(/\s*```$/i, "").trim();
    await transform(generatedCode.replace(/export\s+default\s+/g, ""), { loader: "jsx", target: "es2020" });
    const validationShape = {
      type: "OBJECT",
      properties: { passed: { type: "BOOLEAN" }, reasoning: { type: "STRING" } },
      required: ["passed", "reasoning"],
    };
    const supervisorInstruction = isInteractive
      ? `This is Interactive mode. Specifically verify that the component implements exactly the chosen ${spec.interactive?.mechanic} mechanic, visibly uses real grounded names rather than placeholders, and has a logically reachable win/end state through its controls. The win state must fully replace or fully opaque-overlay the prior instructions and game content; no previous instructions may remain visibly readable behind it. Also reject any player-visible wording that mentions components, DOM, Canvas, code, state, APIs, generation, specifications, validation, or other developer concepts. Reject if any condition is missing or if completion cannot be reached.`
      : "This is Production mode. Verify every required field/action and grounded initial record.";
    const validation = JSON.parse(await generateVertexContent({
      contents: [{ role: "user", parts: [{ text: `You are Backlot's independent Build Supervisor. ${supervisorInstruction} Also validate functionality and all source restrictions. Fail on any substantive omission. Write the reasoning for a film or television producer in plain language; do not mention code, components, compilation, APIs, DOM, Canvas, state, schemas, prompts, or other developer implementation details. Return only JSON.\n\nSPEC:\n${JSON.stringify(request.specJson)}\n\nGROUNDED FACTS:\n${JSON.stringify(request.groundedFacts ?? null)}\n\nCOMPONENT:\n${generatedCode}` }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: validationShape, temperature: 0 },
    })) as { passed: boolean; reasoning: string };
    if (!validation.passed) {
      await db.update(toolRequestsTable).set({ generatedCode: null, status: "validation-failed", supervisorStatus: "failed", supervisorReason: validation.reasoning }).where(eq(toolRequestsTable.id, request.id));
      res.status(422).json({ error: `The quality check found a problem: ${validation.reasoning}` });
      return;
    }
    const [row] = await db.update(toolRequestsTable)
      .set({ generatedCode, status: "built", supervisorStatus: "passed", supervisorReason: validation.reasoning })
      .where(eq(toolRequestsTable.id, request.id))
      .returning();
    const payload = serializeToolRequest(row);
    res.json(BuildToolRequestResponse.parse(payload));
  } catch (error) {
    req.log.error({ err: error }, "Tool build generation failed");
    const reason = error instanceof Error ? error.message : "Unknown component preparation error.";
    await db.update(toolRequestsTable)
      .set({ generatedCode: null, status: "validation-failed", supervisorStatus: "failed", supervisorReason: "Backlot could not prepare a working version of this tool. Please try building it again." })
      .where(eq(toolRequestsTable.id, request.id));
    res.status(500).json({ error: "Backlot could not prepare a working version of this tool. Please try building it again." });
  }
});

router.post("/tool-requests/:id/publish", async (req, res) => {
  const parsedParams = PublishToolRequestParams.safeParse({ id: Number(req.params.id) });
  if (!parsedParams.success || !Number.isInteger(parsedParams.data.id)) {
    res.status(404).json({ error: "Tool request not found." });
    return;
  }

  const [request] = await db.select().from(toolRequestsTable).where(eq(toolRequestsTable.id, parsedParams.data.id)).limit(1);
  if (!request) {
    res.status(404).json({ error: "Tool request not found." });
    return;
  }
  if (request.status !== "built" || !request.generatedCode) {
    res.status(409).json({ error: "Only successfully built tools can be published." });
    return;
  }

  try {
    const baseSlug = slugifyToolName((request.specJson as { name?: string }).name ?? "production-tool");
    let slug = request.publishedSlug ?? baseSlug;
    if (!request.publishedSlug) {
      const [collision] = await db.select({ id: toolRequestsTable.id }).from(toolRequestsTable).where(eq(toolRequestsTable.publishedSlug, slug)).limit(1);
      if (collision && collision.id !== request.id) slug = `${baseSlug}-${request.id}`;
    }

    const componentSource = request.generatedCode
      .replace(/^\s*import\s+React(?:\s*,\s*\{[^}]*\})?\s+from\s+["']react["']\s*;?\s*$/gm, "")
      .replace(/^\s*import\s+\{[^}]*\}\s+from\s+["']react["']\s*;?\s*$/gm, "")
      .replace(/export\s+default\s+GeneratedTool\s*;?/g, "")
      .replace(/export\s+default\s+/g, "")
      .replace(/(?:const|let|var)\s*\{\s*useState\s*,\s*useEffect\s*\}\s*=\s*React\s*;?/g, "")
      .replace(/(?:const|let|var)\s*\{\s*useEffect\s*,\s*useState\s*\}\s*=\s*React\s*;?/g, "");
    if (!/(?:function|const|let|var)\s+GeneratedTool\b/.test(componentSource)) {
      throw new Error("The generated source does not define the required GeneratedTool component.");
    }
    const entrySource = `const { useState, useEffect } = React;\n${componentSource}\nconst root = ReactDOM.createRoot(document.getElementById("root"));\nroot.render(React.createElement(GeneratedTool));`;
    const compiled = await transform(entrySource, {
      loader: "jsx",
      format: "iife",
      target: ["es2020"],
      minify: true,
      legalComments: "none",
    });
    if (!compiled.code) throw new Error("The generated component compiled to an empty JavaScript bundle.");

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="description" content="${String((request.specJson as { purpose?: string }).purpose ?? "Standalone production tool").replace(/[&<>"']/g, "")}" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='%23202331'/><path d='M19 17h17c9 0 14 4 14 11 0 5-3 8-7 10 6 1 9 5 9 10 0 9-7 13-17 13H19V17zm13 17h4c4 0 6-2 6-5s-2-5-6-5h-4v10zm0 19h5c5 0 7-2 7-6 0-3-2-5-7-5h-5v11z' fill='%23f05a3a'/></svg>" />
  <title>${String((request.specJson as { name?: string }).name ?? "Production Tool").replace(/[&<>"']/g, "")}</title>
  <style>html,body,#root{min-height:100%;margin:0}body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#f5f3ee;color:#202331}*{box-sizing:border-box}</style>
</head>
<body>
  <div id="root"></div>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="./app.js"></script>
</body>
</html>`;
    const publishedUrl = `/tools/${slug}/`;
    const [row] = await db.update(toolRequestsTable)
      .set({ publishedSlug: slug, publishedUrl, publishedHtml: html, publishedBundle: compiled.code })
      .where(eq(toolRequestsTable.id, request.id))
      .returning();
    res.json(PublishToolRequestResponse.parse(serializeToolRequest(row)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown packaging error.";
    req.log.error({ err: error, toolRequestId: request.id }, "Standalone tool publication failed");
    res.status(500).json({ error: "Backlot couldn’t publish this tool. Please try again." });
  }
});

publishedToolsRouter.get("/:slug/", async (req, res) => {
  const [request] = await db.select().from(toolRequestsTable).where(eq(toolRequestsTable.publishedSlug, req.params.slug)).limit(1);
  if (!request?.publishedHtml) {
    res.status(404).type("text/plain").send("Published tool not found.");
    return;
  }
  res.type("html").send(request.publishedHtml);
});

publishedToolsRouter.get("/:slug/app.js", async (req, res) => {
  const [request] = await db.select().from(toolRequestsTable).where(eq(toolRequestsTable.publishedSlug, req.params.slug)).limit(1);
  if (!request?.publishedBundle) {
    res.status(404).type("text/plain").send("Published tool bundle not found.");
    return;
  }
  res.type("application/javascript").send(request.publishedBundle);
});

export default router;