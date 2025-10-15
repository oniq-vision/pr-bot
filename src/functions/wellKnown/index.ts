// src/functions/wellKnown/index.ts
import { app, HttpResponseInit } from "@azure/functions";

app.http("oauthProtectedResource", {
  route: ".well-known/oauth-protected-resource",
  methods: ["GET"],
  authLevel: "anonymous", // must be public
  handler: async (): Promise<HttpResponseInit> => {
    // Your AAD tenant + the API audience your Function expects
    const tenant = "15d44907-7d07-4e14-9014-f392cf0faf1a";
    const audience = "api://5cf1eac5-f4a8-48cc-b72e-022977678f1e"; // your Function's "Allowed token audiences"

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // (Optional but nice) who is protecting this resource
        resource: audience,
        // One or more authorization servers that can issue tokens for this resource
        authorization_servers: [
          `https://login.microsoftonline.com/${tenant}/v2.0`
        ]
      })
    };
  }
});
