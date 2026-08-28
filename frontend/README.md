# Travel Congestion web frontend

`frontend/` is the Next.js App Router frontend for the Travel Congestion service.
It keeps analysis state in browser memory only and sends browser requests to the
same-origin BFF routes. The BFF is the only frontend layer that calls the
deployed Google Cloud Run API.

## Local development

Use Node.js `22.14.0` and install the lockfile dependencies.

```bash
npm ci
CLOUD_RUN_API_BASE_URL=https://travel-congestion-lni2ukneka-du.a.run.app npm run dev
```

Open <http://localhost:3000>. The Cloud Run URL is an example operating target;
do not put API keys or provider secrets in this project.

Useful checks:

```bash
npm run typecheck
npm run lint
npm test
npm run build
CLOUD_RUN_API_BASE_URL=https://travel-congestion-lni2ukneka-du.a.run.app npm run smoke:cloud-run
```

## Vercel setup

Create or connect a Vercel project with these settings:

- Project name: `travel-congestion`
- Root Directory: `frontend`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Node.js: `22.x` (the repository `.node-version` is `22.14.0`)
- Server environment variable: `CLOUD_RUN_API_BASE_URL`
- Public browser environment variable: `NEXT_PUBLIC_NAVER_MAP_CLIENT_ID`

Set `CLOUD_RUN_API_BASE_URL` separately for Preview and Production. Never use a
`NEXT_PUBLIC_` variant: the value must remain available only to the Node.js
Route Handlers. Run the Cloud Run smoke command before promoting a revision.

`NEXT_PUBLIC_NAVER_MAP_CLIENT_ID` is intentionally public because the Naver
Maps Web Dynamic Map SDK loads in the browser. Restrict this client ID in the
NAVER Cloud Platform application to the deployed web service URL
(`travel-congestion.vercel.app`) and enable Web Dynamic Map. The web app uses
the current `ncpKeyId` SDK parameter and falls back to the coordinate preview
when the key is missing or the domain is not authorized.

Production: <https://travel-congestion.vercel.app>. The exact `vercel.app`
hostname is an alias for the current Production deployment. After a manual
Production deployment, update it with:

```bash
npx vercel alias set <deployment-url> travel-congestion.vercel.app
```

The privacy policy is maintained at `../docs/privacy-policy.html` and is served
by the deployed app at `/privacy-policy.html`. Replace the marked operator and
contact placeholders before public release.
