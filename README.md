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

**A rewrite `source` must end in `/` or carry a file extension.** The
trailing-slash redirect runs *before* rewrites, so a `source` of `/foo` never
matches — the request is 308'd to `/foo/` first and the rewrite is looked up
against that. Verified on this project: `source: "/_hosttest"` returned a bare
308, `source: "/_hosttest/"` served the venue. The client-domain rules below
are unaffected, because `/` is already slash-terminated and asset paths carry
extensions (Vercel does not append a slash to those).

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

Venue folders sit at the root, so every venue always has a working fallback at
`soch-venues.vercel.app/<venue-slug>/` with no rewrite and no limit.

## Every venue gets `<slug>.soovita.com`

Rizwan calls the venue *before* a site is built, so there are no throwaway
proposal links here — each site is a real pitch and gets a real hostname. The
builder does this automatically on publish: it registers the hostname on the
project and writes its two rewrites into `vercel.json`, **in the same commit as
the venue files** so publishing costs one Vercel build, not two.

**There is no per-venue DNS step.** `soovita.com` carries a single wildcard
CNAME:

```
*   CNAME   3d308f8515b4c967.vercel-dns-017.com
```

That one record covers every subdomain forever. Adding the hostname to the
Vercel project needs no DNS round-trip, because the apex is already verified on
the account.

**Why a wildcard in DNS and not a wildcard domain in Vercel.** Registering
`*.soovita.com` *with Vercel* forces Vercel's nameservers onto the domain — and
soovita.com carries live Google Workspace mail (`MX → smtp.google.com`) plus a
Google site-verification TXT. A wildcard CNAME leaves the nameservers at
Hostinger and cannot touch MX at all.

The binding limit is **50 domains per project on Hobby**, so 50 live venues.
Retiring a venue detaches its hostname and frees the slot.

## Giving a signed client their own domain

Same mechanism, their hostname:

```json
{ "source": "/",       "has": [{ "type": "host", "value": "papamisha.ee" }], "destination": "/papa-misha/" },
{ "source": "/:path*", "has": [{ "type": "host", "value": "papamisha.ee" }], "destination": "/papa-misha/:path*" }
```

Their domain needs its own DNS record pointing at the project (the wildcard
only covers `soovita.com`). `has` with `type: "host"` is a plain `vercel.json`
feature — no Next.js, no framework.

**A client's domain is never detached by the retire flow**, even forced —
unbinding it would take their live site down with no way for us to restore it.
A venue carrying a non-`soovita.com` host blocks the delete instead.

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
