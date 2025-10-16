// src/shared/security.ts
import type { HttpRequest, InvocationContext } from "@azure/functions";

/** Shape of what Easy Auth sends in x-ms-client-principal */
export type ClientPrincipal = {
  auth_typ?: string;
  name_typ?: string;
  role_typ?: string;
  claims: Array<{ typ: string; val: string }>;
  identityProvider?: string;
  userId?: string;
  userDetails?: string;
};
console.log("security module loaded", process.env.ALLOW_LOCAL_NOAUTH);
/** Extract the principal from Easy Auth header */
export function getPrincipal(req: HttpRequest): ClientPrincipal | null {
  const b64 = req.headers.get("x-ms-client-principal");
  if (!b64) return null;
  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as ClientPrincipal;
  } catch {
    return null;
  }
}

/** Pull a single claim by type */
export function claim(principal: ClientPrincipal, type: string): string | undefined {
  return principal.claims.find(c => c.typ === type)?.val;
}

/** Helpers for common claims */
export function getOid(principal: ClientPrincipal): string | undefined {
  return claim(principal, "http://schemas.microsoft.com/identity/claims/objectidentifier") ?? claim(principal, "oid");
}
export function getAppId(principal: ClientPrincipal): string | undefined {
  // appid is present for app-only (client credentials) tokens
  return claim(principal, "appid");
}
export function getScopes(principal: ClientPrincipal): string[] {
  const scp = claim(principal, "http://schemas.microsoft.com/identity/claims/scope") ?? claim(principal, "scp");
  return scp ? scp.split(" ").filter(Boolean) : [];
}
export function getRoles(principal: ClientPrincipal): string[] {
  // roles appear as multiple 'roles' claims
  return principal.claims.filter(c => c.typ === "roles").map(c => c.val);
}

/**
 * Authorization gate:
 * - Ensures a principal exists (Easy Auth succeeded)
 * - Optionally enforces at least one scope or role
 * - Supports local bypass via env ALLOW_LOCAL_NOAUTH="1"
 */
export function requireAuth(
  req: HttpRequest,
  context: InvocationContext,
  opts?: { anyScopes?: string[]; anyRoles?: string[] }
): { ok: true; principal: ClientPrincipal } | { ok: false; status: number; body: string } {
  // Local dev bypass (func start with no Easy Auth)
  
  if (process.env.ALLOW_LOCAL_NOAUTH === "1") {
    const fake: ClientPrincipal = { claims: [{ typ: "scp", val: "bot.invoke" }, { typ: "name", val: "local-dev" }] };
    return { ok: true, principal: fake };
  }

  const principal = getPrincipal(req);
  if (!principal) {
    const headers = [] as Array<[string, string | null]>;
    for (const k of req.headers.keys()) {
      headers.push([k, req.headers.get(k)?.substring(0, 10) || null]);
    }
    context.warn("Unauthorized access attempt", headers);
    // Important: DO NOT log "Missing security headers" anymore—this is now our 401 path.
    return { ok: false, status: 401, body: "Unauthorized" };
  }

  const scopes = getScopes(principal);
  const roles = getRoles(principal);

  if (opts?.anyScopes?.length) {
    const hasScope = scopes.some(s => opts.anyScopes!.includes(s));
    if (!hasScope) return { ok: false, status: 403, body: "Forbidden (missing scope)" };
  }

  if (opts?.anyRoles?.length) {
    const hasRole = roles.some(r => opts.anyRoles!.includes(r));
    if (!hasRole) return { ok: false, status: 403, body: "Forbidden (missing role)" };
  }

  return { ok: true, principal };
}
