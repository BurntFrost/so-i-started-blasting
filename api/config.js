import { getAll } from "@vercel/edge-config";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const config = await getAll(["maintenance", "announcement", "featuredClipId", "aiEnabled"]);
    return res.status(200).json({
      maintenance: config?.maintenance ?? false,
      announcement: config?.announcement ?? null,
      featuredClipId: config?.featuredClipId ?? null,
      aiEnabled: config?.aiEnabled ?? true,
    });
  } catch {
    // Edge Config unavailable — return safe defaults so the app always works
    return res.status(200).json({
      maintenance: false,
      announcement: null,
      featuredClipId: null,
      aiEnabled: true,
    });
  }
}
