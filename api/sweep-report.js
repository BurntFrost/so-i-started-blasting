import { head } from "@vercel/blob";

const BLOB_KEY = "sweep-report.json";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const blob = await head(BLOB_KEY);
    const response = await fetch(blob.url);
    const report = await response.json();
    return res.status(200).json(report);
  } catch (err) {
    if (err.code === "blob_not_found") {
      return res.status(200).json({ error: "No sweep data yet" });
    }
    return res.status(500).json({ error: err.message });
  }
}
