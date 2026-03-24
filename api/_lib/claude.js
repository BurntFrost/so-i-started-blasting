import { MODEL_ID } from "./prompts.js";

/**
 * Call Claude API with the user's API key.
 * Returns the parsed text response.
 * Throws on API errors with a descriptive message.
 */
export async function callClaude(apiKey, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL_ID,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("INVALID_KEY");
    if (res.status === 429) throw new Error("RATE_LIMITED");
    throw new Error(`CLAUDE_ERROR: ${res.status} ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new Error("EMPTY_RESPONSE");
  return text;
}
