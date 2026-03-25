import { useState, useCallback } from "react";

const STORAGE_KEY = "sisb-api-key";

function loadKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState(loadKey);
  // Start as "connected" if a saved key exists — avoids a validation call on every page load.
  // Trade-off: if the key was revoked since last visit, UI shows green LED until next API call fails.
  // This is acceptable because the real validation happens on first dial use.
  const [keyStatus, setKeyStatus] = useState(
    loadKey() ? "connected" : "empty",
  ); // "empty" | "validating" | "connected" | "invalid" | "error"

  const setApiKey = useCallback(async (key) => {
    if (!key) {
      setApiKeyState("");
      setKeyStatus("empty");
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return;
    }

    setApiKeyState(key);
    setKeyStatus("validating");

    try {
      const res = await fetch("/api/validate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
      });
      const data = await res.json();

      if (data.valid) {
        try { localStorage.setItem(STORAGE_KEY, key); } catch {}
        setKeyStatus("connected");
      } else {
        setKeyStatus("invalid");
      }
    } catch {
      setKeyStatus("error");
    }
  }, []);

  const clearApiKey = useCallback(() => {
    setApiKeyState("");
    setKeyStatus("empty");
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  }, []);

  const markInvalid = useCallback(() => {
    setKeyStatus("invalid");
  }, []);

  const hasKey = keyStatus === "connected";

  return { apiKey, keyStatus, hasKey, setApiKey, clearApiKey, markInvalid };
}
