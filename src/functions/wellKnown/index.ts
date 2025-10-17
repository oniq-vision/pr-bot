// src/functions/wellKnown/index.ts
import { app, HttpResponseInit } from "@azure/functions";
// serve metadata for the resource https://pr-bot.oniqvision.com/mcp
// Resource base URL you tell ChatGPT:
const RESOURCE = "https://pr-bot.oniqvision.com/mcp";

app.http("oauthProtectedResource", {
  route: ".well-known/oauth-protected-resource/mcp",
  methods: ["GET"],
  authLevel: "anonymous",
  handler: async () => ({
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      // MUST equal the MCP URL you type into ChatGPT
      resource: RESOURCE,

      // Point to Keycloak (DCR-capable) as the authorization server
      authorization_servers: [
        {
          issuer:
            "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot",
          authorization_endpoint:
            "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot/protocol/openid-connect/auth",
          token_endpoint:
            "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot/protocol/openid-connect/token",
          registration_endpoint:
            "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot/clients-registrations/openid-connect",
          jwks_uri:
            "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot/protocol/openid-connect/certs"
        }
      ]
    })
  })
});
