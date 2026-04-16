import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { errorHandler } from "./middleware/error.js";
import health from "./routes/health.js";
import analyze from "./routes/analyze.js";
import generate from "./routes/generate.js";
import integrate from "./routes/integrate.js";

const app = new Hono();

app.use("*", cors({
  origin: process.env.APP_URL || "http://localhost:3012",
  credentials: true,
}));
app.use("*", errorHandler);

app.route("/health", health);
app.route("/api/analyze", analyze);
app.route("/api/generate", generate);
app.route("/api/integrate", integrate);

const port = Number(process.env.PORT) || 3011;

if (process.env.NODE_ENV !== "test") {
  console.log(`Onboarder API running on port ${port}`);
  serve({ fetch: app.fetch, port });
}

export default app;
