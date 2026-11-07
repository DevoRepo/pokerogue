<!--
SPDX-License-Identifier: CC-BY-NC-SA-4.0
-->

# Deploying privately to Cloudflare Pages

The site is uploaded from your own machine, because `ffmpeg` and the asset steps need more time than is sensible for every push.

## Why not plain Pages hosting

A build has about 35,000 files, and the Pages free plan allows 20,000 per site. `scripts/deploy/pack-assets.mjs` merges JSON files and icons into shard files, and a worker serves them at their original URLs. No game code changes.

The worker also requires a password before it serves anything, and refuses all requests if the password secret is missing.

## Steps

Run these from the repo root. You need `ffmpeg`, and the submodules checked out.

1. Build with sound effect support, then shrink and pack the output:

   ```bash
   VITE_OPUS_SFX=1 corepack pnpm exec vite build --mode app
   node scripts/deploy/optimize-assets.mjs
   node scripts/deploy/pack-assets.mjs
   ```

2. Upload. The first run asks to create the project:

   ```bash
   npx wrangler@4 pages deploy dist --project-name pokerouge --branch main --commit-dirty=true
   ```

3. Set or change the password. It is stored encrypted at Cloudflare and never in this repo:

   ```bash
   npx wrangler@4 pages secret put SITE_PASSWORD --project-name pokerouge
   ```

4. Deploy again so the new password takes effect, as in step 2.

Changing the password signs out every browser.

## Limits to keep in mind

- All traffic to this site passes through the worker, and that counts toward the free 100,000 Worker requests a day. A fresh load makes about 900 requests, and browser caching cuts that on repeat visits.
- A long password matters, because the worker cannot limit repeated guesses by itself.
- For stronger protection with a custom domain or a `*.pages.dev` address, add **Cloudflare Access** with one-time codes sent to one email address. It lives under Zero Trust > Access > Applications in the Cloudflare dashboard. Create a self-hosted application for the site's address, with an **Allow** policy for that one email.

## License

If anyone other than you ever gets access to the site, the AGPL requires offering them this fork's source code. Keep the fork public. Upstream's assets are non-commercial where licensable, and some have no license information, so do not charge for or advertise this site.
