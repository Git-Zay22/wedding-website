/**
 * Cloudflare Worker: wedding-rsvp
 * Paste into the Worker editor, then Deploy.
 *
 * Secrets required:
 * - SCRIPT_URL  (Apps Script /exec URL)
 * - RSVP_TOKEN  (must match Apps Script RSVP_TOKEN)
 *
 * GET  = health only (no query PII)
 * POST = create / update / lookup (JSON body; token added server-side)
 */

const ALLOWED_ORIGINS = [
  "https://zayrolandcarenwedding.com",
  "https://www.zayrolandcarenwedding.com",
  "https://git-zay22.github.io",
  "http://localhost",
  "http://127.0.0.1",
];

function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.some(
    (o) => origin === o || (origin && origin.startsWith(o))
  );
  return {
    "Access-Control-Allow-Origin": allow ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

/**
 * Apps Script /exec POSTs process doPost, then 302 to googleusercontent /macros/echo.
 * That echo URL must be fetched with GET (POST returns HTML 405 "Page Not Found").
 */
async function postAppsScript(scriptUrl, bodyText) {
  const headers = { "Content-Type": "text/plain;charset=utf-8" };

  let res = await fetch(scriptUrl, {
    method: "POST",
    redirect: "manual",
    headers,
    body: bodyText,
  });

  if (res.status >= 300 && res.status < 400) {
    const loc = res.headers.get("Location");
    if (loc) {
      return fetch(loc, { method: "GET", redirect: "follow" });
    }
  }

  // Fallback: some runtimes hide Location; follow redirects (POST→GET on 302).
  if (res.status === 0 || res.type === "opaqueredirect") {
    return fetch(scriptUrl, {
      method: "POST",
      redirect: "follow",
      headers,
      body: bodyText,
    });
  }

  return res;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (!env.SCRIPT_URL || !env.RSVP_TOKEN) {
      return json(
        { ok: false, error: "Worker is not configured yet." },
        500,
        origin
      );
    }

    try {
      if (request.method === "GET") {
        return json(
          { ok: true, message: "Caren & Zayrol RSVP proxy is live." },
          200,
          origin
        );
      }

      if (request.method === "POST") {
        let body = {};
        try {
          body = JSON.parse((await request.text()) || "{}");
        } catch (_) {
          return json({ ok: false, error: "Invalid JSON body." }, 400, origin);
        }

        body.token = env.RSVP_TOKEN;
        const bodyText = JSON.stringify(body);

        const upstream = await postAppsScript(env.SCRIPT_URL, bodyText);
        const text = await upstream.text();
        return new Response(text, {
          status: upstream.status || 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            ...corsHeaders(origin),
          },
        });
      }

      return json({ ok: false, error: "Method not allowed." }, 405, origin);
    } catch (err) {
      return json(
        { ok: false, error: "Proxy error. Please try again." },
        500,
        origin
      );
    }
  },
};
