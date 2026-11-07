/*
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Cloudflare Pages worker for the private deployment. It does two things:
 * 1. Requires the password in the `SITE_PASSWORD` secret before serving anything, and fails closed without it.
 * 2. Serves small files that `pack-assets.mjs` merged into shard files, at their original URLs,
 *    which keeps the deployment under the Pages limit of 20,000 files.
 */

// biome-ignore lint/correctness/noUndeclaredVariables: pack-assets.mjs replaces this placeholder with the index
const INDEX = JSON.parse(__PACK_INDEX__);

const COOKIE_NAME = "site_gate";
const COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const CONTENT_TYPES = { json: "application/json", png: "image/png" };
/** Files under `/assets/` have content hashes in their names, so they can be cached forever. */
const HASHED_CACHE = "private, max-age=31536000, immutable";
const DEFAULT_CACHE = "private, max-age=86400";

const LOGIN_PAGE = failed => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Private</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #484050; color: #fff; font: 16px system-ui, sans-serif; }
  form { display: grid; gap: 12px; padding: 16px; width: min(320px, calc(100vw - 32px)); box-sizing: border-box; }
  input, button { padding: 12px; font: inherit; border-radius: 6px; border: 1px solid #888; }
  button { background: #fff; color: #222; cursor: pointer; }
  p { margin: 0; color: #ffb4b4; }
</style>
</head>
<body>
<form method="post" action="/__login">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
  ${failed ? "<p>Wrong password.</p>" : ""}
  <button type="submit">Open</button>
</form>
</body>
</html>`;

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

function readCookie(request) {
  for (const part of (request.headers.get("Cookie") ?? "").split(";")) {
    const [name, value] = part.trim().split("=");
    if (name === COOKIE_NAME) {
      return value ?? "";
    }
  }
  return "";
}

function html(body, status) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

async function servePacked(entry, pathname, request, env) {
  const [shard, offset, length] = entry;
  const url = new URL(`/packs/${shard}.bin`, request.url);
  const response = await env.ASSETS.fetch(new Request(url));
  if (!response.ok) {
    return new Response("Not found", { status: 404 });
  }
  const buffer = await response.arrayBuffer();
  const extension = pathname.split(".").pop();
  return new Response(buffer.slice(offset, offset + length), {
    headers: {
      "Content-Type": CONTENT_TYPES[extension] ?? "application/octet-stream",
      "Cache-Control": DEFAULT_CACHE,
    },
  });
}

export default {
  async fetch(request, env) {
    if (!env.SITE_PASSWORD) {
      return html("Site password is not configured.", 503);
    }
    const url = new URL(request.url);
    const expected = await sha256Hex(`pokerouge-gate:${env.SITE_PASSWORD}`);

    if (url.pathname === "/__login" && request.method === "POST") {
      const form = await request.formData();
      const submitted = await sha256Hex(`pokerouge-gate:${form.get("password") ?? ""}`);
      if (!safeEqual(submitted, expected)) {
        return html(LOGIN_PAGE(true), 401);
      }
      return new Response(null, {
        status: 303,
        headers: {
          Location: "/",
          "Set-Cookie": `${COOKIE_NAME}=${expected}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`,
          "Cache-Control": "no-store",
        },
      });
    }

    if (!safeEqual(readCookie(request), expected)) {
      return html(LOGIN_PAGE(false), 401);
    }

    let pathname;
    try {
      pathname = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    const entry = INDEX[pathname];
    if (entry) {
      return servePacked(entry, pathname, request, env);
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", pathname.startsWith("/assets/") ? HASHED_CACHE : DEFAULT_CACHE);
    headers.set("X-Robots-Tag", "noindex");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
