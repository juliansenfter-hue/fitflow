// FitFlow — Strava integration Edge Function (Supabase / Deno)
// ---------------------------------------------------------------------------
// ONE deployable function, routed by the last path segment:
//   POST /strava/connect      (user JWT)  -> { authUrl }         start OAuth
//   GET  /strava/callback     (public)    -> 302 back to the app  finish OAuth
//   POST /strava/sync         (user JWT)  -> { connected, athlete, activities }
//   POST /strava/status       (user JWT)  -> { connected, athlete, lastSync }
//   POST /strava/disconnect   (user JWT)  -> { ok }
//
// The Strava CLIENT SECRET stays here on the server and never reaches the
// browser. The per-user access/refresh tokens live in public.strava_tokens and
// are read/written only via the service-role client below.
//
// Deploy (see supabase/STRAVA-SETUP.md):
//   supabase functions deploy strava --no-verify-jwt
//   supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... STRAVA_STATE_SECRET=<random>
// ---------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CLIENT_ID = Deno.env.get("STRAVA_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("STRAVA_CLIENT_SECRET") ?? "";
const STATE_SECRET = Deno.env.get("STRAVA_STATE_SECRET") || CLIENT_SECRET || "fitflow-state";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const CALLBACK = `${SUPABASE_URL}/functions/v1/strava/callback`;
const SCOPE = "read,activity:read_all";

// service-role client — bypasses RLS, the only thing allowed near the tokens
const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

// ---- signed state (HMAC-SHA256) so the callback can trust who started the flow
const enc = new TextEncoder();
function b64url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlJson(o: unknown): string {
  return b64url(enc.encode(JSON.stringify(o)));
}
function fromB64urlJson(s: string): any {
  const p = s.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(p));
}
async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(STATE_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return b64url(new Uint8Array(sig));
}
async function signState(payload: Record<string, unknown>): Promise<string> {
  const p = b64urlJson(payload);
  return `${p}.${await hmac(p)}`;
}
async function verifyState(state: string | null): Promise<any | null> {
  if (!state) return null;
  const [p, sig] = String(state).split(".");
  if (!p || !sig) return null;
  if ((await hmac(p)) !== sig) return null;
  try {
    const o = fromB64urlJson(p);
    if (!o.exp || o.exp < Date.now() / 1000) return null;
    return o;
  } catch {
    return null;
  }
}

// ---- resolve the calling Supabase user from the bearer token
async function userFromReq(req: Request): Promise<any | null> {
  const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) return null;
  const c = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } });
  const { data, error } = await c.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
}

// ---- fetch a valid Strava token row, refreshing it if it is about to expire
async function getToken(uid: string): Promise<any | null> {
  const { data } = await admin.from("strava_tokens").select("*").eq("user_id", uid).maybeSingle();
  if (!data) return null;
  let t = data;
  const now = Math.floor(Date.now() / 1000);
  if (t.expires_at <= now + 60) {
    const r = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: "refresh_token", refresh_token: t.refresh_token }),
    }).then((x) => x.json()).catch(() => null);
    if (!r?.access_token) return null;
    await admin.from("strava_tokens").update({
      access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at, updated_at: new Date().toISOString(),
    }).eq("user_id", uid);
    t = { ...t, access_token: r.access_token, refresh_token: r.refresh_token, expires_at: r.expires_at };
  }
  return t;
}

// ---- normalise a Strava activity to the fields the FitFlow client maps from
function mapActivity(a: any) {
  return {
    id: a.id,
    name: a.name,
    type: a.sport_type || a.type,
    start_date: a.start_date_local || a.start_date,
    moving_time: a.moving_time,
    elapsed_time: a.elapsed_time,
    distance: a.distance,
    total_elevation_gain: a.total_elevation_gain,
    average_speed: a.average_speed,
    average_heartrate: a.average_heartrate,
    max_heartrate: a.max_heartrate,
    average_watts: a.average_watts,
    weighted_average_watts: a.weighted_average_watts,
    max_watts: a.max_watts,
    kilojoules: a.kilojoules,
    average_cadence: a.average_cadence,
    suffer_score: a.suffer_score,
    calories: a.calories,
  };
}

// ---- routes -----------------------------------------------------------------
async function connect(req: Request): Promise<Response> {
  if (!CLIENT_ID) return json({ error: "STRAVA_CLIENT_ID not set on the server." }, 500);
  const user = await userFromReq(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const body = await req.json().catch(() => ({}));
  const ret = String(body.ret || "").slice(0, 300);
  if (!/^https?:\/\//.test(ret)) return json({ error: "bad return url" }, 400);
  const state = await signState({ uid: user.id, ret, exp: Math.floor(Date.now() / 1000) + 600 });
  const authUrl =
    `https://www.strava.com/oauth/authorize?client_id=${encodeURIComponent(CLIENT_ID)}` +
    `&response_type=code&redirect_uri=${encodeURIComponent(CALLBACK)}` +
    `&approval_prompt=auto&scope=${encodeURIComponent(SCOPE)}&state=${encodeURIComponent(state)}`;
  return json({ authUrl });
}

function redirect(ret: string, params: Record<string, string>): Response {
  const u = new URL(ret);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

async function callback(url: URL): Promise<Response> {
  const st = await verifyState(url.searchParams.get("state"));
  const ret = st?.ret && /^https?:\/\//.test(st.ret) ? st.ret : (SUPABASE_URL || "https://example.com");
  const err = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  if (err || !code || !st) return redirect(ret, { strava: err ? `error:${err}` : "error" });

  const tok = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code, grant_type: "authorization_code" }),
  }).then((r) => r.json()).catch(() => null);
  if (!tok?.access_token) return redirect(ret, { strava: "error" });

  const ath = tok.athlete || {};
  await admin.from("strava_tokens").upsert({
    user_id: st.uid,
    athlete_id: ath.id ?? null,
    athlete_name: [ath.firstname, ath.lastname].filter(Boolean).join(" ") || null,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    expires_at: tok.expires_at,
    scope: tok.scope || SCOPE,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  return redirect(ret, { strava: "connected" });
}

async function sync(req: Request): Promise<Response> {
  const user = await userFromReq(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const t = await getToken(user.id);
  if (!t) return json({ connected: false });

  const body = await req.json().catch(() => ({}));
  const after = Number(body.after) || t.last_sync || 0;

  let all: any[] = [];
  for (let page = 1; page <= 4; page++) {
    const res = await fetch(`https://www.strava.com/api/v3/athlete/activities?after=${after}&per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${t.access_token}` },
    });
    if (!res.ok) {
      if (res.status === 401) return json({ connected: false, error: "token" });
      break;
    }
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) break;
    all = all.concat(arr);
    if (arr.length < 100) break;
  }

  await admin.from("strava_tokens").update({ last_sync: Math.floor(Date.now() / 1000), updated_at: new Date().toISOString() }).eq("user_id", user.id);
  return json({ connected: true, athlete: t.athlete_name, athleteId: t.athlete_id, activities: all.map(mapActivity) });
}

async function status(req: Request): Promise<Response> {
  const user = await userFromReq(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  const { data } = await admin.from("strava_tokens").select("athlete_name,athlete_id,last_sync").eq("user_id", user.id).maybeSingle();
  return json({ connected: !!data, athlete: data?.athlete_name ?? null, athleteId: data?.athlete_id ?? null, lastSync: data?.last_sync ?? null });
}

async function disconnect(req: Request): Promise<Response> {
  const user = await userFromReq(req);
  if (!user) return json({ error: "unauthorized" }, 401);
  await admin.from("strava_tokens").delete().eq("user_id", user.id);
  return json({ ok: true });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const url = new URL(req.url);
  const seg = url.pathname.split("/").filter(Boolean).pop();
  try {
    if (seg === "connect") return await connect(req);
    if (seg === "callback") return await callback(url);
    if (seg === "sync") return await sync(req);
    if (seg === "status") return await status(req);
    if (seg === "disconnect") return await disconnect(req);
    return json({ error: `unknown route: ${seg}` }, 404);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
