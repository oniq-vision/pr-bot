import  {app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getOctokitForInstallation } from '../../shared/octokit';
import { verifyRequest, verifyHmac, resolveHmacSecret } from '../../shared/security';
app.setup({ enableHttpStream: true });

const MAX_BYTES = 512 * 1024;

export const commentHandler = async function (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.startsWith('application/json')) return { status: 415, body: 'Content-Type must be application/json' };

    const raw = await req.text();
    if (raw.length > MAX_BYTES) return { status: 413, body: 'Payload too large' };

    const vr = await verifyRequest(req, context);
    if (!vr.ok) return { status: 401, body: 'Unauthorized' };

    const ts = req.headers.get('x-timestamp')!;
    const sig = req.headers.get('x-signature')!;
    const secret = await resolveHmacSecret(context);
    if (!verifyHmac(raw, ts, sig, secret)) return { status: 401, body: 'Invalid signature' };

    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return { status: 400, body: 'Invalid JSON' }; }

    const { owner, repo, number, body: commentBody, installationId } = body;
    if (!owner || !repo || !number || !commentBody) return { status: 400, body: 'owner, repo, number, body required' };

    const octokit = await getOctokitForInstallation(installationId);
    const { data: comment } = await octokit.issues.createComment({ owner, repo, issue_number: number, body: commentBody });

    return { status: 200, jsonBody: { ok: true, url: comment.html_url, id: comment.id } };
  } catch (e: any) {
    context.error(e);
    return { status: 500, body: 'Internal error' };
  }
}

app.http("comment", { route: "comment", methods: ["POST"], authLevel: "anonymous", handler: commentHandler });