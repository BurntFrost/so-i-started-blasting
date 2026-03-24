import { useState, useEffect, useRef } from "react";

const STATUS_LABELS = {
  empty: "CONNECT DECODER TO RECEIVE PIRATE SIGNALS",
  validating: "SCANNING FOR SIGNAL...",
  connected: "DECODER CONNECTED",
  invalid: "NO SIGNAL — CHECK DECODER",
};

const STATUS_LABEL_COLORS = {
  empty: "var(--text-2)",
  validating: "var(--neon-yellow)",
  connected: "var(--neon-green)",
  invalid: "var(--neon-red)",
};

function StatusLed({ status }) {
  const cls =
    status === "connected"
      ? "service-led led-green"
      : status === "validating"
        ? "service-led led-yellow"
        : "service-led led-red";
  return <span className={cls} />;
}

export function ServicePanel({ apiKey, keyStatus, onSubmitKey, onClearKey, onClose }) {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef(null);

  // Auto-flip back 1 second after connecting
  useEffect(() => {
    if (keyStatus === "connected") {
      const timer = setTimeout(() => {
        onClose();
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [keyStatus, onClose]);

  // Focus input when panel mounts
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handlePaste(e) {
    const text = e.clipboardData.getData("text").trim();
    if (text) {
      e.preventDefault();
      setInputValue(text);
      onSubmitKey(text);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && inputValue.trim()) {
      onSubmitKey(inputValue.trim());
    }
  }

  const labelColor = STATUS_LABEL_COLORS[keyStatus] ?? "var(--text-2)";
  const labelText = STATUS_LABELS[keyStatus] ?? "";

  // Mask the key display — show last 4 chars
  const maskedKey = apiKey
    ? `${"•".repeat(Math.max(0, apiKey.length - 4))}${apiKey.slice(-4)}`
    : "";

  return (
    <div className="service-panel">
      {/* Back-panel screw heads for decoration */}
      <div className="service-screws">
        <span className="service-screw" />
        <span className="service-screw" />
        <span className="service-screw" />
        <span className="service-screw" />
      </div>

      {/* Product sticker */}
      <div className="service-sticker">
        <div className="sticker-line sticker-model">MODEL: CH-4NN3L-Z3R0</div>
        <div className="sticker-line sticker-serial">SN: 4815162342</div>
        <div className="sticker-line sticker-warning">⚡ CAUTION: PIRATE FREQUENCIES</div>
      </div>

      {/* Decoder port section */}
      <div className="service-port-section">
        <div className="service-port-label-row">
          <StatusLed status={keyStatus} />
          <span className="service-port-header">◈ SIGNAL DECODER</span>
        </div>

        <div className="service-port">
          {keyStatus === "connected" ? (
            <span className="service-port-connected-key">{maskedKey}</span>
          ) : (
            <input
              ref={inputRef}
              type="password"
              className="service-port-input"
              value={inputValue}
              placeholder="PASTE API KEY..."
              onChange={(e) => setInputValue(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              spellCheck={false}
            />
          )}
        </div>

        <div className="service-label" style={{ color: labelColor }}>
          {labelText}
        </div>

        {keyStatus === "connected" && (
          <button className="service-disconnect-btn" onClick={onClearKey}>
            Disconnect
          </button>
        )}
      </div>

      {/* Flip back button */}
      <button className="service-back-btn" onClick={onClose}>
        ← FLIP BACK
      </button>
    </div>
  );
}
