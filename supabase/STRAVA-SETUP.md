# FitFlow × Strava — Einrichtung (einmalig)

Echtes Strava läuft über eine **Supabase Edge Function** (der Client Secret bleibt
serverseitig, nie im Browser). Du machst das **einmal** als App-Betreiber — danach
verbindet **jedes Konto sein eigenes Strava** selbst über den Button in der App.

Projekt-Ref: `aohegzhunqqdfqbrbdph` → `https://aohegzhunqqdfqbrbdph.supabase.co`

---

## 1) Strava-API-App registrieren
1. Öffne **https://www.strava.com/settings/api** und lege eine App an (falls noch nicht geschehen).
2. **Authorization Callback Domain:** `aohegzhunqqdfqbrbdph.supabase.co`  ← nur die Domain, ohne `https://`, ohne Pfad.
3. Notiere dir **Client ID** und **Client Secret**.

## 2) Datenbank-Tabelle anlegen
Supabase-Dashboard → **SQL Editor** → Inhalt von [`strava_tokens.sql`](strava_tokens.sql) einfügen und **Run**.
(Die Tabelle hat RLS an und **keine** Policies — nur die Edge Function darf an die Tokens.)

## 3) Edge Function deployen
Voraussetzung: [Supabase CLI](https://supabase.com/docs/guides/cli) installiert und `supabase login` gemacht.

```bash
# im Projekt-Ordner (dort wo der Ordner supabase/ liegt)
supabase link --project-ref aohegzhunqqdfqbrbdph

# Secrets setzen (Client Secret verlässt so nie den Server)
supabase secrets set \
  STRAVA_CLIENT_ID=DEINE_CLIENT_ID \
  STRAVA_CLIENT_SECRET=DEIN_CLIENT_SECRET \
  STRAVA_STATE_SECRET=$(openssl rand -hex 32)

# Function deployen — WICHTIG: --no-verify-jwt, weil Strava den /callback ohne
# Supabase-Token aufruft (die Function prüft Nutzer selbst über den Bearer-Token).
supabase functions deploy strava --no-verify-jwt
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` und `SUPABASE_SERVICE_ROLE_KEY` werden von
Supabase automatisch in die Function injiziert — die musst du **nicht** setzen.

## 4) Fertig — testen
- In der App als **echtes Konto** (nicht Demo/Test) einloggen → **Import & Sync** → bei **Strava** auf **Verbinden**.
- Es öffnet sich Strava's eigene Zustimmungsseite → einloggen/erlauben.
- Rücksprung in die App (`?strava=connected`) → Aktivitäten werden geladen und im Dashboard als echte Werte berechnet.

---

## Was wo passiert
| Route (`…/functions/v1/strava/…`) | Aufrufer | Zweck |
|---|---|---|
| `POST /connect` | App (mit Nutzer-Token) | signierte Authorize-URL bauen |
| `GET /callback` | Strava-Redirect (öffentlich) | Code→Token tauschen, Token speichern, zurück zur App |
| `POST /sync` | App | neue Aktivitäten holen (Token-Refresh automatisch) |
| `POST /status` | App | Verbindungsstatus |
| `POST /disconnect` | App | Token löschen |

- **Ein** App-Registrierung (du) → **Client ID + Secret**. Liegt in den Function-Secrets.
- **Jeder Nutzer** verbindet sein eigenes Strava; seine Tokens liegen pro `user_id` in `strava_tokens` (RLS, nur Service-Role).
- Gesyncte Aktivitäten laufen durch denselben `FFImports`-Speicher wie FIT-Dateien → echte Kennzahlen + Cross-Device-Sync über `public.activities`.

## Strava-Rate-Limits / Freigabe
Eine neue Strava-App ist zunächst auf **1 verbundenen Athleten** begrenzt (dich).
Für weitere Nutzer im Strava-App-Dashboard höheres Limit / „Single Player → Everyone" beantragen.
Standard-Limits: 100 Requests/15 min, 1000/Tag — für persönliche Nutzung reichlich.
