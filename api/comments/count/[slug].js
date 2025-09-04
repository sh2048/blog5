// api/comments/count/[slug].js
// Lightweight endpoint to return the count of comments for a slug.

const { kv } = require("@vercel/kv");

module.exports = async function handler(req, res) {
  const slug = (req.query && req.query.slug) || "";
  if (!slug) {
    res.status(400).json({ error: "Missing slug" });
    return;
  }
  try {
    const count = await kv.get(`comments_count:${slug}`);
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    res.status(200).json({ slug, count: Number(count || 0) });
  } catch (err) {
    console.error("count api error", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
};