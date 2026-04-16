import type { Context, Next } from "hono";

type ContentfulStatusCode = Parameters<Context["json"]>[1];

export async function errorHandler(c: Context, next: Next) {
  try {
    await next();
  } catch (err) {
    console.error("Unhandled error:", err);

    // Duck-typed check for Anthropic SDK errors (more reliable than instanceof across module boundaries)
    const maybeApiErr = err as {
      status?: number;
      error?: { error?: { message?: string } };
      message?: string;
    };

    if (maybeApiErr && typeof maybeApiErr.status === "number" && maybeApiErr.status >= 400) {
      const nestedMessage = maybeApiErr.error?.error?.message;
      const message = nestedMessage || maybeApiErr.message || "Upstream API error";
      return c.json({ error: message }, maybeApiErr.status as ContentfulStatusCode);
    }

    const message = err instanceof Error ? err.message : "Internal server error";
    return c.json({ error: message }, 500);
  }
}
