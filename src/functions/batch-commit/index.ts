import  {app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getOctokitForInstallation } from '../../shared/octokit';
import { verifyRequest, verifyHmac, resolveHmacSecret } from '../../shared/security';

const MAX_BYTES = 512 * 1024;
type FileInput = { path: string; content: string };
app.setup({ enableHttpStream: true });
export const batchCommitHandler = async function (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
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

    const { owner, repo, branch, files, message, installationId } = body;
    if (!owner || !repo || !branch || !Array.isArray(files) || !message) {
      return { status: 400, body: 'owner, repo, branch, files[], message required' };
    }

    const octokit = await getOctokitForInstallation(installationId);
    const { data: ref } = await octokit.git.getRef({ owner, repo, ref: `heads/${branch}` });
    const { data: baseCommit } = await octokit.git.getCommit({ owner, repo, commit_sha: ref.object.sha });

    const { data: tree } = await octokit.git.createTree({
      owner, repo,
      base_tree: baseCommit.tree.sha,
      tree: (files as FileInput[]).map(f => ({ path: f.path, mode: '100644', type: 'blob', content: f.content }))
    });

    const { data: commit } = await octokit.git.createCommit({
      owner, repo, message, tree: tree.sha, parents: [ref.object.sha]
    });

    await octokit.git.updateRef({ owner, repo, ref: `heads/${branch}`, sha: commit.sha, force: false });

    return { status: 200, jsonBody: { ok: true, commitSha: commit.sha } };
  } catch (e: any) {
    context.error(e);
    return { status: 500, body: 'Internal error' };
  }
}
app.http("batchCommit", { route: "batch-commit", methods: ["POST"], authLevel: "anonymous", handler: batchCommitHandler });