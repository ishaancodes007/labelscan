# Deploying BeautyLens (so you can open it from a link)

Two pieces: the **Next.js app** (the website) and the **Python identity service** (name matching). Suggested hosts: **Vercel** for the app and **Render** for the service. Both can deploy straight from this GitHub repo and both have free tiers. **I could not deploy these myself:** it needs your accounts, and nothing in this build environment has them. Everything below is prepared and checked locally, but the hosts' own screens and limits are described from general knowledge and may have changed; check them as you go.

The app works without the Python service (it falls back to a basic matcher and says so), so you can deploy the website first and see it right away.

## 0. Before you start
- Branch to deploy: `claude/beautylens-master-prompt-v3-x0r1uq` (or merge it to your default branch first).
- No secrets are needed for the basic version. Never put `ANTHROPIC_API_KEY` anywhere except the Render service's environment.

## 1. The Python service on Render (do this first, so you have its URL)
1. render.com -> **New** -> **Blueprint** -> connect the GitHub repo and branch. Render reads `render.yaml` and proposes one web service, `beautylens-identity`.
2. Accept the defaults (`plan: free`). Leave `ANTHROPIC_API_KEY` and `ANTHROPIC_RESOLVER_MODEL` empty unless you want the optional AI helper (see `docs/PHASE6.md`).
3. Deploy. The build runs `scripts/build_backend.sh`: installs dependencies, downloads the official EU glossary from the Publications Office, builds the dictionary, and **fails on purpose** if the dictionary has fewer than 20,000 entries (so you never get a silently degraded service). Expect a few minutes.
4. When it is live, open `https://<your-service>.onrender.com/healthz`. You should see `{"ok":true,"dictionary":"glossary-2025-1175",...}`.
5. In the service's **Environment** tab, copy the generated `SERVICE_TOKEN` value.

Notes: free instances sleep when idle and take roughly a minute to wake. The app pings the service as soon as `/analyze` opens, so by the time someone presses Analyze it is usually awake. `render.yaml` pins Python 3.12.7; the code was developed on 3.13, and **3.12 has not been tested**. If the build complains, set `PYTHON_VERSION` to a version Render lists as supported.

## 2. The website on Vercel
1. vercel.com -> **Add New** -> **Project** -> import the same repo (and branch). Framework: Next.js (auto-detected). No build settings to change; the build copies the OCR files itself.
2. Add these **Environment Variables** (Production):
   | Name | Value |
   |---|---|
   | `PYTHON_API_BASE_URL` | `https://<your-service>.onrender.com` (no trailing slash) |
   | `PYTHON_API_TOKEN` | the `SERVICE_TOKEN` you copied from Render |
   | `RESOLVER_TIMEOUT_MS` | `60000` (lets the first request wait for a sleeping service) |
3. Deploy. Vercel gives you a URL like `https://<project>.vercel.app`. That is your link.

If you skip step 1, leave those variables out: the site works and shows "Enhanced recognition unavailable" on `/analyze`.

## Keeping the site up to date
If Vercel offered to "create a Git repository" when you imported the project, it made a **one-time private copy** of the code. Later pushes to this repository do not reach that copy. To fix it: in the Vercel project, go to **Settings → Git**, disconnect the copy, connect `ishaancodes007/labelscan`, and set the branch to deploy to `claude/beautylens-master-prompt-v3-x0r1uq`. From then on every push redeploys.

## 3. Check it
- Open the URL on your phone. The landing page should load; try **Analyze a label**, paste text from `DEMO.md`, and confirm the provider line says "Enhanced recognition: on".
- `https://<your-service>.onrender.com/v1/ingredients/resolve` without the token must answer 401.
- Photos: the camera input needs HTTPS, which both hosts provide.

## What can go wrong
- **"Enhanced recognition unavailable"**: the service is asleep, the URL has a typo, or `PYTHON_API_TOKEN` does not match `SERVICE_TOKEN`. Open `/healthz` to wake it, then retry.
- **Alternatives search empty**: Open Beauty Facts is slow or down; the page says so.
- **Vercel function timeout** on a very long first request: `/api/analyze` asks for up to 30 s; the free plan may cap it lower.

## If you want me to do it
Say which host you chose. I would need a token for it stored as an environment secret (not pasted in chat), and the host's domain allowed in the environment's network settings. Without that, the steps above are the way.
