import { GoogleAuth } from "google-auth-library";

export const VERTEX_LOCATION = "global";
export const VERTEX_MODEL = "gemini-2.5-flash";

type VertexResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
};

function credentials() {
  const raw = process.env.GCP_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("GCP_SERVICE_ACCOUNT_JSON is not configured.");
  const parsed = JSON.parse(raw) as { project_id?: string };
  if (!parsed.project_id) throw new Error("The configured service account has no project_id.");
  return { parsed, projectId: parsed.project_id };
}

export function vertexEndpoint() {
  const { projectId } = credentials();
  return `https://aiplatform.googleapis.com/v1/projects/${projectId}/locations/${VERTEX_LOCATION}/publishers/google/models/${VERTEX_MODEL}:generateContent`;
}

export async function generateVertexContent(body: unknown) {
  const { parsed } = credentials();
  const auth = new GoogleAuth({
    credentials: parsed,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
  });
  const client = await auth.getClient();
  let response;
  for (let attempt = 0; ; attempt += 1) {
    try {
      response = await client.request<VertexResponse>({
        url: vertexEndpoint(),
        method: "POST",
        data: body,
      });
      break;
    } catch (error) {
      const status = (error as { response?: { status?: number } }).response?.status;
      if (![429, 503].includes(status ?? 0) || attempt >= 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)));
    }
  }
  const text = response.data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Vertex AI returned an empty response.");
  return text;
}