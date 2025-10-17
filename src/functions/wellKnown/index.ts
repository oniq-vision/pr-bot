// src/functions/wellKnown/index.ts
import { app, HttpResponseInit } from "@azure/functions";
// serve metadata for the resource https://pr-bot.oniqvision.com/mcp
// Resource base URL you tell ChatGPT:
const RESOURCE = "https://pr-bot.oniqvision.com/mcp";
const handler = async (): Promise<HttpResponseInit> => ({
    status: 200,
    headers: {
        "Content-Type": "application/json",
        // CORS is important because ChatGPT fetches this from the browser
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type"
    },
    body: JSON.stringify({
        // MUST equal the MCP URL you type into ChatGPT
        resource: "https://pr-bot.oniqvision.com/mcp",
        scopes_supported: ["openid", "email"],
        // Point to Keycloak (DCR-capable) as the authorization server
        authorization_servers: [
            "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot"
        ]
    })
})
app.http("oauthProtectedResourceMCP", {
    route: ".well-known/oauth-protected-resource/mcp",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: async (): Promise<HttpResponseInit> => ({
        status: 200,
        headers: {
            "Content-Type": "application/json",
            // CORS is important because ChatGPT fetches this from the browser
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Authorization, Content-Type"
        },
        body: JSON.stringify({
            "resource": "https://pr-bot.oniqvision.com/mcp",
            "client_id": "57e68c31-d9c7-4da1-8cac-f5884fd07ff7",
            "scopes_supported": ["openid", "email", "offline_access"],
            "authorization_server": "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot",
            "token_endpoint_auth_method": "none"
        })
    })
});
app.http("oauthProtectedResource", {
    route: ".well-known/oauth-protected-resource",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: handler
});
