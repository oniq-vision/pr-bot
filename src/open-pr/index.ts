import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { getOctokitForInstallation } from '../shared/octokit';
import { verifyRequest, verifyHmac, resolveHmacSecret } from '../shared/security';

const MAX_BYTES = 512 * 1024;

export default async function (req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.startsWith('application/json')) return { status: 415, body: 'Content-Type must be application/json' };

    const raw = await req.text();
    if (raw.length > MAX_BYTES) return { status: 413, body: 'Payload too large' };

    const vr = await verifyRequest(req, context);
    if (!vr.ok) return { status: 401, body: 'Unauthorized' };

    const ts = req.headers.get('x-timestamp')!;
    const sig = req.headers.get('x-signature')!;
    const secret = await resolveHmacSecret();
    if (!verifyHmac(raw, ts, sig, secret)) return { status: 401, body: 'Invalid signature' };

    let body: any = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return { status: 400, body: 'Invalid JSON' }; }

    const { owner, repo, head, base = 'main', title, body: prBody, installationId } = body;
    if (!owner || !repo || !head || !title) return { status: 400, body: 'owner, repo, head, title required' };

    const octokit = await getOctokitForInstallation(installationId);
    const { data: pr } = await octokit.pulls.create({ owner, repo, head, base, title, body: prBody });

    return { status: 200, jsonBody: { ok: true, url: pr.html_url, number: pr.number } };
  } catch (e: any) {
    context.error(e);
    return { status: 500, body: 'Internal error' };
  }
}
