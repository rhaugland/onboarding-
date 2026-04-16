import { Agent, setGlobalDispatcher } from "undici";

export const maxDuration = 600;

export const dynamic = "force-dynamic";

const API_URL = process.env.API_URL || "http://localhost:3011";

// Install a global undici dispatcher with 10-min timeouts for long Claude generation calls
setGlobalDispatcher(
  new Agent({
    headersTimeout: 600_000,
    bodyTimeout: 600_000,
    connectTimeout: 30_000,
  })
);

async function proxyRequest(request: Request) {
  const url = new URL(request.url);
  const targetUrl = `${API_URL}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  try {
    const body = request.method !== "GET" ? await request.text() : undefined;

    const res = await fetch(targetUrl, {
      method: request.method,
      headers,
      body,
    });

    return new Response(res.body, {
      status: res.status,
      headers: res.headers,
    });
  } catch (err) {
    console.error("[proxy error]", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Proxy error" }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
