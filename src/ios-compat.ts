import worker from "./worker.js";
import type { Env } from "./runtime-types.js";

export { NtfyServerDO } from "./worker.js";

const TOPIC_AUTH_PATH = /^\/[-_A-Za-z0-9]{1,64}(?:,[-_A-Za-z0-9]{1,64})*\/auth$/;

function configured(env: Env): boolean {
  return Boolean(env.NTFY_ACCESS_TOKEN || (env.NTFY_USERNAME && env.NTFY_PASSWORD));
}

function authorizationFrom(request: Request): string {
  const direct = request.headers.get("authorization");
  if (direct) return direct;
  const encoded = new URL(request.url).searchParams.get("auth");
  if (!encoded) return "";
  try { return atob(encoded); } catch { return ""; }
}

function parseBasic(auth: string): { username: string; password: string } | null {
  if (!auth.startsWith("Basic ")) return null;
  try {
    const decoded = atob(auth.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return null;
    return { username: decoded.slice(0, separator), password: decoded.slice(separator + 1) };
  } catch {
    return null;
  }
}

function authorized(request: Request, env: Env): boolean {
  if (!configured(env)) return true;
  const auth = authorizationFrom(request);
  if (env.NTFY_ACCESS_TOKEN && auth === `Bearer ${env.NTFY_ACCESS_TOKEN}`) return true;
  const basic = parseBasic(auth);
  if (!basic) return false;
  if (env.NTFY_USERNAME && env.NTFY_PASSWORD && basic.username === env.NTFY_USERNAME && basic.password === env.NTFY_PASSWORD) return true;
  if (env.NTFY_ACCESS_TOKEN && basic.username === "" && basic.password === env.NTFY_ACCESS_TOKEN) return true;
  return false;
}

function normalizeTokenBasicAuth(request: Request, env: Env): Request {
  if (!env.NTFY_ACCESS_TOKEN) return request;
  const basic = parseBasic(authorizationFrom(request));
  if (!basic || basic.username !== "" || basic.password !== env.NTFY_ACCESS_TOKEN) return request;
  const headers = new Headers(request.headers);
  headers.set("authorization", `Bearer ${env.NTFY_ACCESS_TOKEN}`);
  return new Request(request, { headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const normalized = normalizeTokenBasicAuth(request, env);
    const url = new URL(normalized.url);

    if (normalized.method === "GET" && TOPIC_AUTH_PATH.test(url.pathname)) {
      if (authorized(normalized, env)) {
        return Response.json({ success: true }, { headers: { "cache-control": "no-store" } });
      }
      return Response.json(
        { code: 40101, http: 401, error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store", "www-authenticate": "Basic realm=\"ntfy\", Bearer" } },
      );
    }

    return worker.fetch(normalized, env, ctx);
  },
};
