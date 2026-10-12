# Ortigia — notes for Claude

A survival-and-trade maze game set in Ortigia (Siracusa). TypeScript + Vite + Canvas, no backend.
Live at https://ortigia.zankay.com (also https://ortigia.pages.dev), hosted on Cloudflare Pages (project `ortigia`).

## Working on the game
- Every tunable number lives in `src/config.ts`; game rules in `src/game/`, drawing in `src/render/`, HTML UI in `src/ui/`.
- Before committing, run `npm run typecheck` and `npm run test:sim` (headless rules tests); add a test for new rules.
- The player is on a phone as often as on a desktop: check layouts at 390×844 as well as wide screens.
- The street map is a hand-traced approximation until real OSM data is added (see README: map:fetch / map:build).

## Publishing
- Changes go to `main`. A GitHub Actions workflow (`.github/workflows/deploy.yml`) tests, builds and deploys every push to `main`, once the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are set.
- Manual deploy from a session: `npm run deploy` (needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` environment variables and network access to api.cloudflare.com). The site is not reachable from the cloud container, so confirm a deploy with the Cloudflare API rather than by loading the page.
- Never ask the owner to paste tokens into the chat.
