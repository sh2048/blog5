// api/comments/[slug].js
// Vercel Serverless Function to GET and POST comments for a given slug.
// Storage: Vercel KV (@vercel/kv).
// Requires env vars: KV_REST_API_URL, KV_REST_API_TOKEN set in the Vercel project.
// CORS: Allows cross-origin from any domain by default. Adjust ALLOWED_ORIGINS to restrict.

const { kv } = require("@vercel/kv");
const { randomUUID, createHash } = require("crypto");

const ALLOWED_ORIGINS = ["*"]; // e.g., ["https://yourblog.domain", "https://blog8.vercel.app"]

function cors(req, res) {
  const origin = req.headers.origin || "*";
  const allowOrigin = ALLOWED_ORIGINS.includes("*")
    ? "*"
    : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] || "");
  res.setHeader("Access-Control-Allow-Origin", allowOrigin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function getClientIp(req) {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || "0.0.0.0";
}

function sha256Hex(str) {
  return createHash("sha256").update(str).digest("hex");
}

function sanitizeText(s, maxLen) {
  return String(s || "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

module.exports = async function handler(req, res) {
  cors(req, res);

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  const slug = (req.query && req.query.slug) || "";
  if (!slug) {
    res.status(400).json({ error: "Missing slug" });
    return;
  }

  const key = `comments:${slug}`;

  try {
    if (req.method === "GET") {
      // Newest first for convenience
      const raw = await kv.lrange(key, 0, -1);
      const parsed = (raw || []).map((item) => {
        try { return typeof item === "string" ? JSON.parse(item) : item; }
        catch { return null; }
      }).filter(Boolean);
      // Return oldest first (chronological)
      parsed.reverse();
      res.status(200).json({ slug, comments: parsed });
      return;
    }

    if (req.method === "POST") {
      const body = req.body || {};
      const name = sanitizeText(body.name, 60);
      const content = sanitizeText(body.content, 5000);
      const email = sanitizeText(body.email || "", 120) || undefined;
      const parentId = sanitizeText(body.parentId || "", 64) || null;

      if (!name || !content) {
        res.status(400).json({ error: "Name and content are required" });
        return;
      }

      const ip = getClientIp(req);
      const now = new Date().toISOString();

      const comment = {
        id: randomUUID(),
        slug,
        name,
        email,
        content,
        parentId,
        createdAt: now,
        ipHash: sha256Hex(ip)
      };

      // Push to list (tail). We'll fetch and reverse for chronological order.
      await kv.rpush(key, JSON.stringify(comment));
      await kv.incr(`comments_count:${slug}`);

      res.status(201).json({ ok: true, comment });
      return;
    }

    res.setHeader("Allow", "GET,POST,OPTIONS");
    res.status(405).json({ error: "Method Not Allowed" });
  } catch (err) {
    console.error("comments api error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};