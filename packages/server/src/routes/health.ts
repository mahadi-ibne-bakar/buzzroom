import { Router } from "express";

export const healthRouter = Router();

// A health check exists for two audiences: the hosting platform (Render/Fly/
// etc. ping this to decide whether the instance is alive and should keep
// receiving traffic), and us, right now, as the smallest possible "is the
// server even up" check before anything more interesting is built on top.
healthRouter.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});
