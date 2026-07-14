import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { normalizeError } from "../errors.js";
import type { DomainResult } from "../domain/types.js";

export async function runTool<T extends Record<string, unknown>>(
  operation: () => Promise<DomainResult<T>>,
  summarize: (data: T) => string,
): Promise<CallToolResult> {
  try {
    const result = await operation();
    const structuredContent: Record<string, unknown> = {
      as_of: new Date().toISOString(),
      source: "sleeper",
      warnings: result.warnings,
      data: result.data,
    };
    if (result.cache !== undefined) {
      structuredContent["cache"] = result.cache;
    }
    return {
      content: [{ type: "text", text: summarize(result.data) }],
      structuredContent,
    };
  } catch (error) {
    const normalized = normalizeError(error);
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: JSON.stringify({ code: normalized.code, message: normalized.message }),
        },
      ],
    };
  }
}
