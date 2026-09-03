import { describe, expect, it } from "vitest";
import request from "supertest";
import { createServer } from "../createServer.js";

describe("GET /health", () => {
  it("responds with ok status", async () => {
    const { app } = createServer({ clientOrigin: "http://localhost:5173" });

    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body.status).toBe("ok");
    expect(typeof response.body.uptimeSeconds).toBe("number");
  });
});
