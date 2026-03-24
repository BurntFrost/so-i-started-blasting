import { callClaude } from "./_lib/claude.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = req.headers.authorization?.replace("Bearer ", "");
  if (!apiKey) {
    return res.status(400).json({ valid: false, error: "No API key provided" });
  }

  try {
    await callClaude(apiKey, "Respond with exactly: OK");
    return res.status(200).json({ valid: true });
  } catch (err) {
    return res.status(200).json({ valid: false, error: err.message });
  }
}
