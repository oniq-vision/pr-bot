import crypto from 'crypto';
import { DefaultAzureCredential } from '@azure/identity';
import { SecretClient } from '@azure/keyvault-secrets';
import type { HttpRequest, InvocationContext } from '@azure/functions';

let cachedHmacSecret: string | undefined;

/* ---------- Resolve HMAC secret from env or Key Vault ---------- */
async function getHmacSecret(): Promise<string> {
    if (cachedHmacSecret) return cachedHmacSecret;

    if (process.env.HMAC_SECRET) {
        cachedHmacSecret = process.env.HMAC_SECRET;
        return cachedHmacSecret;
    }

    const vaultUrl = process.env.KEYVAULT_URL;
    const secretName = process.env.HMAC_SECRET_NAME || 'pr-bot-hmac-secret';
    if (!vaultUrl) throw new Error('KEYVAULT_URL not set and HMAC_SECRET not provided');

    const client = new SecretClient(vaultUrl, new DefaultAzureCredential());
    const { value } = await client.getSecret(secretName);
    if (!value) throw new Error('HMAC secret missing in Key Vault');
    cachedHmacSecret = value;
    return value;
}

/* ---------- Create HMAC signature and timing-safe verify ---------- */
export function verifyHmac(rawBody: string, timestamp: string, signature: string, secret: string): boolean {
    const h = crypto.createHmac('sha256', secret);
    h.update(`${timestamp}\n${rawBody}`);
    const expected = `sha256=${h.digest('hex')}`;
    try {
        return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
        return false;
    }
}

/* ---------- Primary request guard ---------- */
export async function verifyRequest(
    req: HttpRequest,
    context: InvocationContext,
    opts: { maxSkewMs?: number } = {}
): Promise<{ ok: boolean; rid?: string; reason?: string }> {
    const maxSkewMs = opts.maxSkewMs ?? 2 * 60 * 1000;
    const url = req.url || '';

    /* --- Allow anonymous access for public discovery endpoint --- */
    if (url.includes('/api/sse')) {
        context.log('Bypassing HMAC for /api/sse (public MCP discovery)');
        return { ok: true, rid: 'public-sse' };
    }

    /* --- Azure Easy Auth fallback --- */
    const principalHeader = req.headers.get('x-ms-client-principal');
    if (principalHeader) {
        try {
            const decoded = JSON.parse(Buffer.from(principalHeader, 'base64').toString());
            if (decoded?.userId || decoded?.userDetails) {
                return { ok: true, rid: decoded.userId || decoded.userDetails };
            }
        } catch (e) {
            context.warn('Invalid EasyAuth principal header', e);
        }
    }

    /* --- HMAC validation (default path) --- */
    const ts = req.headers.get('x-timestamp') || undefined;
    const sig = req.headers.get('x-signature') || undefined;
    const rid = req.headers.get('x-request-id') || undefined;

    if (!ts || !sig || !rid) {
        context.warn('Missing security headers');
        return { ok: false, reason: 'missing headers' };
    }

    const age = Math.abs(Date.now() - Date.parse(ts));
    if (isNaN(age) || age > maxSkewMs) {
        context.warn(`Stale or invalid timestamp: ${ts}`);
        return { ok: false, reason: 'stale' };
    }

    const rawBody = (await req.text().catch(() => '')) || '';
    const secret = await getHmacSecret();
    const valid = verifyHmac(rawBody, ts, sig, secret);
    if (!valid) {
        context.warn('Invalid HMAC signature');
        return { ok: false, reason: 'invalid-signature' };
    }

    return { ok: true, rid };
}

/* ---------- Expose helper ---------- */
export async function resolveHmacSecret(): Promise<string> {
    return getHmacSecret();
}
