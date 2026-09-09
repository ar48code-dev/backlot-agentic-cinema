import { createInsertSchema } from "drizzle-zod";
import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const toolRequestsTable = pgTable("tool_requests", {
  id: serial("id").primaryKey(),
  requestText: text("request_text").notNull(),
  specJson: jsonb("spec_json"),
  groundedFacts: jsonb("grounded_facts"),
  sourcePdfName: text("source_pdf_name"),
  status: text("status").notNull().default("spec-ready"),
  generatedCode: text("generated_code"),
  supervisorStatus: text("supervisor_status"),
  supervisorReason: text("supervisor_reason"),
  publishedSlug: text("published_slug"),
  publishedUrl: text("published_url"),
  publishedHtml: text("published_html"),
  publishedBundle: text("published_bundle"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertToolRequestSchema = createInsertSchema(toolRequestsTable).omit({
  id: true,
  createdAt: true,
});

export type ToolRequestRow = typeof toolRequestsTable.$inferSelect;
export type InsertToolRequest = z.infer<typeof insertToolRequestSchema>;