# End-to-end navigation regression test

This exists because of a production incident: `UniversalSearch` (always mounted
in the app shell) had a useEffect depending on the `perms` object — which
`usePermissions()` recreates every render — and called `setDataHits([])` with a
fresh array each run. Result: a silent, invisible passive-effect render loop
(no errors, app looked idle) whose urgent updates perpetually preempted React
Router v7's `startTransition` navigation. The URL changed on click, the view
never did, until a hard refresh. Simulated-DOM unit tests passed; only the real
production bundle in real Chromium caught it.

Rules this protects:
1. Never put hook-returned objects (`perms`, `branding`, `settings`) in
   dependency arrays — derive stable primitives/keys instead.
2. Any change to always-mounted shell components must pass this test.

## Run
```bash
npm run build
npx vite preview --port 4173 &
npm i -D --no-save playwright && npx playwright install chromium
node e2e/nav.e2e.mjs        # or E2E_BASE_URL=... node e2e/nav.e2e.mjs
```
Expected final line: `RESULT: NAVIGATION_OK`.
