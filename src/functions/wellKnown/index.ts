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
                "issuer": "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot",
                "authorization_servers": [
                    {
                        "issuer": "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot",
                        "authorization_endpoint": "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot/protocol/openid-connect/auth",
                        "token_endpoint": "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot/protocol/openid-connect/token",
                        "registration_endpoint": "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot/clients-registrations/openid-connect",
                        "jwks_uri": "https://lemur-12.cloud-iam.com/auth/realms/on-iq-bot/protocol/openid-connect/certs"
                    }
                ]
            })
        };
    }
});
