# AGENTS.md

## Run locally
- Backend (Express, port 3000, loads `apps/backend/.env`): `cd apps/backend && npm run dev`
- Web (Next.js, proxies `/api/*` to the backend): `cd apps/web && PORT=3001 npm run dev` (3000 is taken by the backend)
- Scheduler runs in the backend every 15 min (ingest today's fixtures/results, AI suggestions, re-predict). Trigger manually: `POST /api/refresh`.

## Database (Prisma + Neon)
- Schema: `packages/database/prisma/schema.prisma`; apply with `cd packages/database && npx prisma db push` (also regenerates the client).
- `apps/backend/.env` and `packages/database/.env` point to the same database.

## Tennis API (SportsAPI365)
- Rate limit 4 req/s: all calls go through the serialized/retrying client in `apps/backend/src/services/tennis-api.ts`.
- Live scores: `/extend/api/events/live` (polled every `LIVE_POLL_SECONDS`, default 60). Upcoming: fixtures date range + `/{tour}/fixtures` (includes time-TBD rows). Window: `UPCOMING_DAYS` (default 3).
- Results feed lags live play by hours and often has bare dates (00:00Z = venue calendar date, no time).

## Verify
- Backend typecheck: `cd apps/backend && npx tsc --noEmit -p .`
- Shared tests: `cd packages/shared && npm test`
- Web typecheck: `cd apps/web && npx tsc --noEmit -p .` (ignore the pre-existing TS6059 rootDir errors about `.next/types`)

## Formula notes
- Remainder = (first-name Abjad value + base) mod 9 (0 → 9); base = 4064 + country + city + local weekday + Hijri month + Hijri year (Arabic names).
- Two separate calculations (`Prediction.method`): PRONUNCIATION (`NameMapping`, Arabic spelling of the name) and MEANING (`NameMeaning`, Arabic phrase for what the name means). Same base, same same-day trend rule.
- `packages/shared/FORMULA_SPECIFICATION.md` is outdated (still describes mod 7 / historical search).
- The results API always lists the winner as player1.

## Failed-pick re-check
- `apps/backend/src/services/pick-review.ts`: for completed matches whose pick lost, the AI suggests alternative Arabic spellings (PRONUNCIATION) / meanings (MEANING) using player nationality; the formula is re-run with each variant (one name swapped at a time). Stored in `PickReview` (no FK, survives the daily purge).
- Runs after each scheduler cycle (`REVIEW_BATCH`, default 20). Manual: `POST /api/reviews/run`, `POST /api/reviews/:matchId`; list: `GET /api/reviews`.
- `Player.country` (nationality from the tennis API) is passed to all AI name/meaning prompts.

## Deploy
- Frontend: Netlify site `ruum-tennis-picks` (config `apps/web/netlify.toml`, base dir `apps/web`). CLI deploy: `cd apps/web && netlify deploy --prod --functions .netlify/functions-internal` (the `--functions` flag is required or the site 404s). `BACKEND_URL` env var on Netlify = backend URL.
- Backend: `render.yaml` (Render blueprint). Prod start: `npm run start:prod -w backend` (runs via tsx because workspace packages ship TS source). Needs an always-on plan so the scheduler keeps running.
