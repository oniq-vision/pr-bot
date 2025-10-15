// src/functions/mcp/index.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// 1) One server instance for the app
const server = new McpServer({ name: "oniq-pr-bot", version: "1.0.0" });

// 2) Register tools (example; swap in your GitHub tools)
server.registerTool(
    "createBranch",
    {
        title: "Create branch",
        description: "Create a Git branch",
        inputSchema: { owner: z.string(), repo: z.string(), base: z.string().default("main"), newBranch: z.string() },
        outputSchema: { ok: z.boolean(), ref: z.string().optional() }
    },
    async ({ owner, repo, base, newBranch }) => {
        // call your existing Octokit logic here
        return { content: [{ type: "text", text: JSON.stringify({ ok: true, ref: `refs/heads/${newBranch}` }) }] };
    }
);

// 3) Single HTTP endpoint for MCP (recommended by spec)
app.http("mcp", {
    route: "mcp",
    methods: ["GET", "POST"],
    authLevel: "anonymous",        // Easy Auth handles JWT outside your code
    handler: async (req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> => {
        const body = req.method === "GET" ? "" : await req.text();

        // **Stateless** transport → note sessionIdGenerator: undefined
        const transport = new StreamableHTTPServerTransport({
            sessionIdGenerator: undefined,
            enableJsonResponse: true,                 // return JSON (no SSE) unless streaming is needed
            enableDnsRebindingProtection: true,
            allowedHosts: ["pr-bot.oniqvision.com"],
            allowedOrigins: ["https://chatgpt.com", "https://chat.openai.com"]
        });

        await server.connect(transport);

        // The SDK’s handler understands Request/Response (Fetch) — cast to any to satisfy types
        const res = new Response();
        await transport.handleRequest(req as any, res as any, body);
        return res as unknown as HttpResponseInit;
    }
});
