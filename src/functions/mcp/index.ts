// src/functions/mcp/index.ts
import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { makeNodeIncomingMessage, makeNodeServerResponse } from "./nodehttpAdapter";

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
app.setup({ enableHttpStream: true });

app.http("mcp", {
  route: "mcp",
  methods: ["POST", "GET", "DELETE"], // POST: JSON-RPC, GET/DELETE: (optional) SSE management
  authLevel: "anonymous",
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<Response> => {
    // Optional: keep health checks out of JSON-RPC path
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
    }

    const bodyText = await req.text();

    // Per-request transport (prevents request-id collisions, matches npm example)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      enableDnsRebindingProtection: true,
      allowedHosts: ["pr-bot.oniqvision.com"],
      allowedOrigins: ["https://chat.openai.com", "https://chatgpt.com"],
    });

    // Close if client disconnects
    const signal = (req as any).signal as AbortSignal | undefined;
    if (signal) signal.addEventListener("abort", () => { try { transport.close(); } catch {} }, { once: true });

    await server.connect(transport);

    // 🔌 Adapt Fetch -> Node shapes for the SDK
    const nodeReq = makeNodeIncomingMessage({
      url: req.url,
      method: req.method,
      headers: req.headers as any,
      bodyText,
    });
    const nodeRes = makeNodeServerResponse();

    // Parse body once for the SDK (like Express's req.body)
    let parsedBody: unknown = undefined;
    const ctype = req.headers.get("content-type") || "";
    if (ctype.includes("application/json") && bodyText) {
      try { parsedBody = JSON.parse(bodyText); } catch {/* ignore, let SDK handle error */}
    }

    await transport.handleRequest(nodeReq as any, nodeRes , parsedBody);

    // Convert buffered Node-style response -> Fetch Response for Azure Functions
    return nodeRes.toFetchResponse();
  },
});
