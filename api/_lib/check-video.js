/**
 * Builds an oEmbed/HEAD check URL for a clip and validates it.
 * Returns "healthy", "dead", or "unknown".
 */

const OEMBED_URLS = {
  youtube: (id) =>
    `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`,
  vimeo: (id) =>
    `https://vimeo.com/api/oembed.json?url=https://vimeo.com/${id}`,
  dailymotion: (id) =>
    `https://www.dailymotion.com/services/oembed?url=https://www.dailymotion.com/video/${id}`,
  streamable: (id) =>
    `https://api.streamable.com/oembed.json?url=https://streamable.com/${id}`,
};

/**
 * Check a single clip's liveness.
 * @param {{ id: string, videoId: string|null, type: string, videoUrl: string|null }} clip
 * @returns {Promise<"healthy"|"dead"|"unknown">}
 */
export async function checkClip(clip) {
  try {
    let url;
    let method = "GET";

    if (clip.type === "video" && clip.videoUrl) {
      url = clip.videoUrl;
      method = "HEAD";
    } else if (OEMBED_URLS[clip.type] && clip.videoId) {
      url = OEMBED_URLS[clip.type](clip.videoId);
    } else {
      return "unknown";
    }

    const res = await fetch(url, {
      method,
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) return "healthy";
    if (res.status === 404 || res.status === 403) return "dead";
    return "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Check multiple clips with a concurrency limit.
 * @param {Array} clips
 * @param {number} concurrency
 * @returns {Promise<{ healthy: Array, dead: Array, unknown: Array }>}
 */
export async function checkAllClips(clips, concurrency = 50) {
  const results = { healthy: [], dead: [], unknown: [] };
  let index = 0;

  async function worker() {
    while (index < clips.length) {
      const clip = clips[index++];
      const status = await checkClip(clip);
      results[status].push(clip);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, clips.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}
