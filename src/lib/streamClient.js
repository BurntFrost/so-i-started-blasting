/**
 * Make a streaming POST request and call onEvent for each SSE "data:" line.
 * Returns an AbortController so the caller can cancel the stream.
 *
 * @param {string} url - API endpoint
 * @param {string} apiKey - Claude API key (sent as Bearer token)
 * @param {object} body - JSON request body
 * @param {(data: object) => void} onEvent - called for each parsed SSE event
 * @param {() => void} onDone - called when stream ends
 * @param {(error: string) => void} onError - called on errors
 * @returns {AbortController}
 */
export function streamRequest(url, apiKey, body, { onEvent, onDone, onError }) {
  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        onError?.(`HTTP ${res.status}: ${text.slice(0, 200)}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Parse complete SSE lines
        const lines = buffer.split("\n");
        buffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const payload = trimmed.slice(6);
          if (payload === "[DONE]") {
            onDone?.();
            return;
          }

          try {
            const data = JSON.parse(payload);
            if (data.error) {
              onError?.(data.error);
            } else {
              onEvent?.(data);
            }
          } catch {
            // Skip unparseable lines
          }
        }
      }

      // Stream ended without [DONE] — still notify
      onDone?.();
    } catch (err) {
      if (err.name !== "AbortError") {
        onError?.(err.message || "Network error");
      }
    }
  })();

  return controller;
}
