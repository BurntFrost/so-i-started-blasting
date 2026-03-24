export function VHSSlot({ powered, active, loading, tapeName, onInsert }) {
  const label = tapeName || (active ? "MYSTERY TAPE" : "INSERT TAPE");

  return (
    <div className={`vhs-slot${!powered ? " vhs-unpowered" : ""}`}>
      {/* Slot slit */}
      <div className="vhs-slot-slit" aria-hidden="true">
        <div className="vhs-slot-slit-inner" />
      </div>

      {/* Tape body that peeks out / slides in */}
      <div
        className={`vhs-tape${active ? " vhs-active" : ""}${loading ? " vhs-loading" : ""}`}
        onClick={powered && !loading ? onInsert : undefined}
        role={powered && !loading ? "button" : undefined}
        tabIndex={powered && !loading ? 0 : undefined}
        aria-label={powered && !loading ? "Generate new tape" : undefined}
        onKeyDown={
          powered && !loading
            ? (e) => (e.key === "Enter" || e.key === " ") && onInsert?.()
            : undefined
        }
      >
        {powered && (
          <span className="vhs-tape-label">{label}</span>
        )}
        {/* Tape reel windows */}
        <span className="vhs-reel vhs-reel-left" aria-hidden="true" />
        <span className="vhs-reel vhs-reel-right" aria-hidden="true" />
      </div>
    </div>
  );
}
