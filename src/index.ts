import { app } from "@azure/functions";

// optional but nice for SSE
app.setup({ enableHttpStream: true });

// Import each function module so their app.http(...) calls execute.
import "./functions/mcp";
import "./functions/branch";
import "./functions/comment";
import "./functions/open-pr";
import "./functions/batch-commit";
import './function/wellKnown';