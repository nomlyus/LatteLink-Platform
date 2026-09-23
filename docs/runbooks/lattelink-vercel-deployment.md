# Nomly Marketing Vercel Deployment

Last verified: `2026-09-22` (repository workflow, Vercel deployment alias, and unauthenticated dev HTTP response)

## Goal

Deploy `apps/lattelink-web` to Vercel. The public production marketing domain is
`https://nomly.us`; the `develop` branch alias is `https://dev.nomly.us`.

**Access policy for `dev.nomly.us`: Vercel sign-in protected.** It is for
authorized release and product testing, not a public prospect entry point.
An unauthenticated request redirecting to `https://vercel.com/sso-api` is
expected. Do not disable deployment protection to make a public HTTP smoke
check pass. The public prospect entry point remains `https://nomly.us`.

## Repo Target

- App: `apps/lattelink-web` (historical package/project name; public brand is Nomly)
- Framework: Next.js
- Package: `@lattelink/web`
- Vercel project: `lattelink`

## Vercel Project Setup

1. Import the GitHub repository into Vercel.
2. Create a dedicated Vercel project for LatteLink.
3. Set the project Root Directory to `apps/lattelink-web`.
4. Leave the framework preset as `Next.js`.
5. Use the default install and build commands unless Vercel fails to detect them.
6. Inspect the project's Git integration and the workflow in
   `.github/workflows/lattelink-vercel.yml` before changing deployment triggers.
   Both can create preview deployments. Keep their ownership explicit so
   duplicate previews are not mistaken for a production release.

## GitHub Actions Secrets

If you use `.github/workflows/lattelink-vercel.yml`, add these repository secrets:

- `LATTELINK_VERCEL_TOKEN`
- `LATTELINK_VERCEL_ORG_ID`
- `LATTELINK_VERCEL_PROJECT_ID`

You can retrieve the org ID and project ID from the `.vercel/project.json` file created after linking the project with `vercel link`.

If you are using the GitHub Actions workflow for this monorepo, run `vercel link --repo` from the repository root on your machine before grabbing the project metadata. Keep the `.vercel` directory local and out of git.

The current workflow behavior is:

- Pull requests and pushes to `develop` verify the app and deploy Vercel
  previews when the marketing lane changes.
- The `dev.nomly.us` project domain is assigned to the `develop` Git branch by
  `.github/workflows/configure-vercel-dev-domains.yml` and
  `scripts/configure-vercel-dev-domains.mjs`. That configuration action is
  manual; it does not grant public access or change deployment protection.
- A published, non-prerelease GitHub Release is the production deployment
  trigger. The workflow validates the release before deploying the tagged
  source with `--prod`. A push to `main` alone does **not** deploy production
  through this workflow.
- Missing Vercel secrets cause the relevant deployment job to skip after
  verification; a green build alone does not prove the domain was updated.

## Domain Setup

The project has `nomly.us` for public production and `dev.nomly.us` as a
`develop` branch domain. Verify the alias and branch on the Vercel deployment
before treating a deploy as current. Domain DNS and protection changes are
separate release-controlled actions; they are not part of a normal smoke check.
Follow the exact DNS target shown in Vercel if a domain must be repaired.

## Contact Intake Configuration

The homepage CTA now submits through `POST /api/pilot-intro` instead of a `mailto:` link.

Configure one of these delivery paths in Vercel Project Settings -> Environment Variables:

- webhook delivery
  - `LATTELINK_CONTACT_WEBHOOK_URL`
  - optional `LATTELINK_CONTACT_WEBHOOK_BEARER_TOKEN`
- Resend email delivery
  - `RESEND_API_KEY`
  - `LATTELINK_CONTACT_EMAIL_TO`
  - `LATTELINK_CONTACT_EMAIL_FROM`

If none of those variables are set, the production release preflight fails.
For a preview, the preflight warns and the form presents a not-configured
message. Do not use a dev lead submission as proof that production lead intake
works.

## Analytics Configuration

The site now supports a GA4 baseline for pageviews and CTA events. Add this Vercel environment variable when you are ready to measure production traffic:

- `NEXT_PUBLIC_GA_MEASUREMENT_ID`

When it is set, the homepage records:

- pageviews
- CTA clicks from the nav, hero, pricing cards, and direct email links
- lead-form starts
- lead-form submission success and failure

If the variable is absent, the site stays functional and emits no analytics events.

## Release Preflight

Before a production cut with the GitHub Actions Vercel lane, validate the pulled Vercel env locally from the app directory:

```bash
cd apps/lattelink-web
pnpm release:check production .vercel/.env.production.local
```

For preview validation:

```bash
cd apps/lattelink-web
pnpm release:check preview .vercel/.env.preview.local
```

The preflight verifies:

- at least one lead-delivery path is configured for production
- webhook URLs are valid `https` URLs
- Resend delivery has all required values
- the GA4 measurement ID format is sane when provided

The GitHub Actions workflow now runs the same preflight after `vercel pull` and before `vercel build`.

## Dev Smoke Check (Authorized Release/Product Tester)

1. Check `https://dev.nomly.us/` without credentials. A `302` redirect to
   Vercel SSO means the intended protection is active; it is **not** a site
   outage. Do not follow the redirect in an unauthenticated uptime check and
   expect a `200` from the app.
2. In Vercel, confirm the `dev.nomly.us` alias points to a `READY` deployment
   from `develop` at the intended commit. A ready deployment by itself does
   not prove that the branch domain points to it.
3. With an authorized Vercel session, open `https://dev.nomly.us/`. Verify the
   Nomly page renders over HTTPS, and the merchant entry CTA routes to
   `https://app-dev.nomly.us`, not the production dashboard.
4. If testing lead intake, use a dev-safe contact sink and verify the result
   there. Do not submit live prospect data to dev as a smoke test.

Record the tested commit, deployment ID, alias, HTTP response, tester and
date. Release owns this verification and the Vercel project/domain settings;
Frontend owns marketing-app behavior. Product approves any change to the
dev-site audience or public-facing experience.

## Production Smoke Check (Only After an Approved Release)

1. Open `https://nomly.us` and confirm the page loads over HTTPS.
2. Submit an authorized test intro and confirm the success state and the
   configured webhook/email delivery.
3. Confirm `https://nomly.us/robots.txt` and `/sitemap.xml` load.
4. Confirm title, manifest, social metadata and canonical URL use `nomly.us`.
5. If GA4 is configured, confirm a pageview and CTA event.

This checklist is not authorization to create or deploy a production release.
Production requires separate explicit approval.

## Troubleshooting Dev Access

- `302` to `vercel.com/sso-api` for an unauthenticated visitor: expected
  protection. Sign in with an authorized Vercel account for the content smoke
  test. Keep the redirect out of public-availability alerting.
- An authorized tester cannot pass SSO: check their Vercel project/team access
  and browser session with Release. Do not disable protection as a workaround.
- SSO succeeds but the page or CTA is wrong: verify the `dev.nomly.us` alias,
  `develop` commit, preview environment, and
  `NEXT_PUBLIC_CLIENT_DASHBOARD_URL=https://app-dev.nomly.us` for the deployed
  build. Escalate app behavior to Frontend.
- Domain or alias missing: inspect the manual
  `configure-vercel-dev-domains` workflow and Vercel project Domains setting.
  Any domain/protection change needs a separate reviewed release action.

## Repo Notes

- Canonical site metadata is set to `https://nomly.us`
- `robots.txt` and `sitemap.xml` are generated by the app router
- Merchant CTA routing uses `app-dev.nomly.us` on the dev host and
  `app.nomly.us` on the public production host; intro CTAs use `/#contact`
- Contact intake uses optional server-side environment variables documented above
- The LatteLink deployment lane is scoped to `apps/lattelink-web/**` plus root package manager files such as `pnpm-lock.yaml`
