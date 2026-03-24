const VALID_ID_RE = /^[A-Za-z0-9_-]{11}$/;

/**
 * Check if a YouTube video exists and is embeddable via oEmbed.
 * Returns true if the video is valid, false otherwise.
 */
export async function verifyVideo(videoId) {
  if (!VALID_ID_RE.test(videoId)) return false;

  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}
