# soch-venues

Every restaurant site Soch builds, in one repo, on one Vercel project.

Replaces the old one-repo-and-one-Vercel-project-per-venue arrangement, which
was heading for ~380 of each.

## How a site gets published

Push to `main`. Vercel is connected to this repo and redeploys automatically —
there is no upload step and no CLI. This is the part that differs from the old
setup, where `deploy.mjs` uploaded files straight to the Vercel API and the
per-venue repo was only a dead snapshot that nothing ever deployed from.

## `vercel.json` notes

**No comments in that file.** Vercel validates it strictly and rejects unknown
top-level keys — including the `"//": "..."` trick used for comments elsewhere
in this codebase. It fails the deployment with
`Invalid request: should NOT have additional property "//"`. Explanations go
here instead.

**`trailingSlash: true` is load-bearing.** Every venue page references its
assets relatively (`assets/…`, `styles.css`). At `/papa-misha` with no trailing
slash the browser resolves those against `/`, and every asset 404s. The `true`
forces a 308 to `/papa-misha/` so relative paths resolve inside the venue
folder.

**The cache headers** were hoisted out of the per-venue `vercel.json` files,
which Vercel ignores anywhere but the project root. Same rules, scoped per
venue folder with `/:venue/…`.

## Layout

```
soch-venues/
├── vercel.json        ← trailing-slash rule, cache headers, client-domain rewrites
├── index.html         ← neutral root page (deliberately lists nothing)
└── <venue-slug>/      ← one built site per venue
    ├── index.html
    ├── styles.css · main.js · vendor/
    ├── assets/        ← img, video, fonts
    └── data/reviews.json
```

Venue folders sit at the root so a proposal link is
`soch-venues.vercel.app/<venue-slug>/` — no rewrite needed, and no limit on
how many venues can live here.

## Giving a signed client their own domain

1. Add the domain to the **`soch-venues`** Vercel project (Settings → Domains).
   Hobby allows 50 domains per project.
2. Add two rules to the `rewrites` array in `vercel.json`:

```json
{ "source": "/",       "has": [{ "type": "host", "value": "papamisha.ee" }], "destination": "/papa-misha/" },
{ "source": "/:path*", "has": [{ "type": "host", "value": "papamisha.ee" }], "destination": "/papa-misha/:path*" }
```

The client's domain then serves their site at its own root, while the
`soch-venues.vercel.app/papa-misha/` path keeps working.

`has` with `type: "host"` is a plain `vercel.json` feature — it does not need
Next.js or any framework.

## Retiring a venue

Delete its folder and commit. The site goes offline on the next deploy.

Note that git keeps the blobs, so the repo does not shrink — hero videos are
5–15 MB per venue and this repo grows by roughly that much per site built.
That was a deliberate trade: self-contained sites with no external CDN
dependency, accepted knowing the repo grows about 1 GB per 90 venues.

## Limits that bind (Vercel Hobby, verified 2026-09-08)

| Limit | Value | Bites when |
|---|---|---|
| Domains per project | 50 | 50 signed clients |
| Routes per deployment | 2048 | 2 rewrites per client domain — not before the domain cap |
| Deployments per day | 100 | Each push is one |
| Concurrent builds | 1 | Two venues published back-to-back queue |

The old 200-projects cap no longer applies — there is only one project now.
