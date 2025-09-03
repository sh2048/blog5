import { createClient } from "@libsql/client";
import { nanoid } from "nanoid";

const ALLOW_ORIGINS = ["https://<你的GitHub用户名>.github.io"];

function cors(res, origin) {
  const allow = (origin && ALLOW_ORIGINS.includes(origin)) ? origin : ALLOW_ORIGINS[0];
  res.setHeader("Access-Control-Allow-Origin", allow);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") { cors(res, req.headers.origin); return res.status(204).end(); }
  cors(res, req.headers.origin);

  const db = createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });

  try {
    if (req.method === "GET") {
      const slug = String(req.query.slug || "").trim();
      if (!slug) return res.status(400).json({ error: "missing slug" });
      const { rows } = await db.execute({ sql: "SELECT id,name,text,ts FROM comments WHERE slug=? ORDER BY ts DESC LIMIT 200", args: [slug] });
      return res.status(200).json(rows);
    }
    if (req.method === "POST") {
      const { slug, name, text } = req.body || {};
      const s = String(slug || "").trim(), n = String(name || "").trim(), t = String(text || "").trim();
      if (!s || !n || !t) return res.status(400).json({ error: "missing fields" });
      if (n.length > 50 || t.length > 500) return res.status(400).json({ error: "too long" });
      const id = nanoid(), ts = Date.now();
      const ip = (req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").toString().slice(0, 64);
      const ua = (req.headers["user-agent"] || "").toString().slice(0, 256);
      await db.execute({ sql: "INSERT INTO comments (id,slug,name,text,ts,ip,ua) VALUES (?,?,?,?,?,?,?)", args: [id,s,n,t,ts,ip,ua] });
      return res.status(201).json({ ok: true, id, ts });
    }
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "internal error" });
  }
}
