/**
 * Zarf Pin Proxy Worker
 *
 * Stateless Cloudflare Worker that pins JSON claim lists to IPFS via Pinata,
 * keeping the Pinata JWT server-side so it never ships to the browser.
 *
 * Routes:
 *   POST /pin     - pin a claim list, returns { cid }
 *   GET  /health  - liveness check
 *
 * Secrets (wrangler secret put):
 *   PINATA_JWT
 *
 * Vars (wrangler.jsonc):
 *   ALLOWED_ORIGINS  - comma-separated list of allowed CORS origins
 *   MAX_BODY_BYTES   - max accepted body size (string-encoded number)
 */

interface Env {
    PINATA_JWT: string;
    ALLOWED_ORIGINS: string;
    MAX_BODY_BYTES: string;
}

interface ClaimList {
    merkleRoot: string;
    leaves: string[];
    schedule: unknown;
    emailHashes?: string[];
    [key: string]: unknown;
}

interface PinataResponse {
    IpfsHash: string;
    PinSize: number;
    Timestamp: string;
}

const PINATA_PIN_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);
        const origin = request.headers.get("Origin");
        const corsHeaders = buildCorsHeaders(origin, env);

        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        if (url.pathname === "/health" && request.method === "GET") {
            return json({ ok: true }, 200, corsHeaders);
        }

        if (url.pathname === "/pin" && request.method === "POST") {
            return handlePin(request, env, corsHeaders);
        }

        return json({ error: "not_found" }, 404, corsHeaders);
    },
};

async function handlePin(
    request: Request,
    env: Env,
    corsHeaders: Record<string, string>
): Promise<Response> {
    const maxBytes = Number(env.MAX_BODY_BYTES) || 1_048_576;
    const contentLength = Number(request.headers.get("Content-Length") || "0");
    if (contentLength > maxBytes) {
        return json({ error: "payload_too_large", maxBytes }, 413, corsHeaders);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.includes("application/json")) {
        return json({ error: "unsupported_media_type" }, 415, corsHeaders);
    }

    let body: ClaimList;
    try {
        const raw = await request.text();
        if (new TextEncoder().encode(raw).length > maxBytes) {
            return json({ error: "payload_too_large", maxBytes }, 413, corsHeaders);
        }
        body = JSON.parse(raw);
    } catch {
        return json({ error: "invalid_json" }, 400, corsHeaders);
    }

    const validationError = validateClaimList(body);
    if (validationError) {
        return json({ error: "invalid_claim_list", reason: validationError }, 400, corsHeaders);
    }

    if (!env.PINATA_JWT) {
        return json({ error: "pinata_not_configured" }, 500, corsHeaders);
    }

    let pinataRes: Response;
    try {
        pinataRes = await fetch(PINATA_PIN_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${env.PINATA_JWT}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                pinataContent: body,
                pinataMetadata: {
                    name: `zarf-claim-list-${body.merkleRoot}`,
                },
            }),
        });
    } catch {
        return json({ error: "pinata_unreachable" }, 502, corsHeaders);
    }

    if (!pinataRes.ok) {
        const detail = await safeText(pinataRes);
        return json(
            { error: "pinata_error", status: pinataRes.status, detail },
            502,
            corsHeaders
        );
    }

    const data = (await pinataRes.json()) as PinataResponse;
    return json({ cid: data.IpfsHash, size: data.PinSize }, 200, corsHeaders);
}

function validateClaimList(body: unknown): string | null {
    if (!body || typeof body !== "object") return "not_an_object";
    const obj = body as Record<string, unknown>;

    if (typeof obj.merkleRoot !== "string" || !obj.merkleRoot.startsWith("0x")) {
        return "missing_or_invalid_merkleRoot";
    }
    if (!Array.isArray(obj.leaves) || obj.leaves.length === 0) {
        return "missing_or_empty_leaves";
    }
    if (!obj.schedule || typeof obj.schedule !== "object") {
        return "missing_schedule";
    }
    return null;
}

function buildCorsHeaders(origin: string | null, env: Env): Record<string, string> {
    const allowed = (env.ALLOWED_ORIGINS || "")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean);

    const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] || "*";

    return {
        "Access-Control-Allow-Origin": allowOrigin,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Max-Age": "86400",
        Vary: "Origin",
    };
}

function json(
    body: unknown,
    status: number,
    extraHeaders: Record<string, string> = {}
): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
            ...extraHeaders,
        },
    });
}

async function safeText(res: Response): Promise<string> {
    try {
        return (await res.text()).slice(0, 500);
    } catch {
        return "";
    }
}
