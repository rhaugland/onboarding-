const API_URL = process.env.API_URL || "http://localhost:3001";

async function proxyRequest(request: Request) {
  const url = new URL(request.url);
  const targetUrl = `${API_URL}${url.pathname}${url.search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const res = await fetch(targetUrl, {
    method: request.method,
    headers,
    body: request.method !== "GET" ? await request.text() : undefined,
  });

  return new Response(res.body, {
    status: res.status,
    headers: res.headers,
  });
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const DELETE = proxyRequest;
