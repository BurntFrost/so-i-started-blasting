import { useEffect, useRef } from "react";

// Tick mark positions around the dial (cosmetic channel numbers)
const TICKS = [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, "📡"];

export function ChannelDial({ powered, active, loading, onSpin }) {
  const pirateRef = useRef(null);

  // Suppress click on the whole dial when unpowered — handled by CSS
  // pointer-events: none, but keep the ref for any future focus management

  return (
    <div className={`channel-dial${!powered ? " dial-unpowered" : ""}`}>
      <div className="dial-outer">
        {/* Tick marks + channel numbers */}
        <div className="dial-ticks" aria-hidden="true">
          {TICKS.map((label, i) => {
            const angle = (i / TICKS.length) * 300 - 150; // spread 300° from -150 to +150
            const isPirate = label === "📡";
            return (
              <div
                key={i}
                className={`dial-tick${isPirate ? " dial-tick-pirate" : ""}`}
                style={{ "--tick-angle": `${angle}deg` }}
              >
                <span className="dial-tick-label">{label}</span>
              </div>
            );
          })}
        </div>

        {/* The physical knob */}
        <div className={`dial-knob${active ? " active" : ""}`}>
          <div className="dial-indicator" />
        </div>

        {/* Pirate zone — the forbidden channel beyond the normal range */}
        <div
          ref={pirateRef}
          className={`dial-pirate-zone${active ? " active" : ""}${loading ? " loading" : ""}`}
          onClick={powered ? onSpin : undefined}
          role={powered ? "button" : undefined}
          tabIndex={powered ? 0 : undefined}
          aria-label={powered ? "Activate pirate signal" : undefined}
          onKeyDown={powered ? (e) => e.key === "Enter" || e.key === " " ? onSpin?.() : null : undefined}
        >
          <span className="pirate-icon">📡</span>
          <span className="pirate-label">PIRATE</span>
        </div>
      </div>

      <div className="dial-label">TUNER</div>
    </div>
  );
}
