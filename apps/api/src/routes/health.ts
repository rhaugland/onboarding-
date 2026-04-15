import { Hono } from "hono";

const health = new Hono();

health.get("/", (c) => {
  return c.json({ status: "ok", service: "onboarder-api" });
});

export default health;
