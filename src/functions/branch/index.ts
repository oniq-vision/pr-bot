import  {app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getOctokitForInstallation } from '../../shared/octokit';
import { verifyRequest, verifyHmac, resolveHmacSecret } from '../../shared/security';

const MAX_BYTES = 512 * 1024;
app.setup({ enableHttpStream: true });
export const branchHandler = async function (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.startsWith('application/json')) {
      return { status: 415, body: 'Content-Type must be application/json' };
    }

    const raw = await req.text();
    if (raw.length > MAX_BYTES) {
      return { status: 413, body: 'Payload too large' };
    }

    const vr = await verifyRequest(req, context);
    if (!vr.ok) return { status: 401, body: 'Unauthorized' };

    const ts = req.headers.get('x-timestamp')!;
    const sig = req.headers.get('x-signature')!;
    const secret = await resolveHmacSecret(context);
    if (!verifyHmac(raw, ts, sig, secret)) {
      return { status: 401, body: 'Invalid signature' };
    }

    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return { status: 400, body: 'Invalid JSON' }; }

    const { owner, repo, base = 'main', newBranch, installationId } = body;
    if (!owner || !repo || !newBranch) {
      return { status: 400, body: 'owner, repo, newBranch required' };
    }

    const octokit = await getOctokitForInstallation(installationId);
    const { data: ref } = await octokit.git.getRef({ owner, repo, ref: `heads/${base}` });
    await octokit.git.createRef({ owner, repo, ref: `refs/heads/${newBranch}`, sha: ref.object.sha });

    return { status: 200, jsonBody: { ok: true, branch: newBranch } };
  } catch (e: any) {
    context.error(e);
    return { status: 500, body: 'Internal error' };
  }
}
app.http("branch", { route: "branch", methods: ["POST"], authLevel: "function", handler: branchHandler });
