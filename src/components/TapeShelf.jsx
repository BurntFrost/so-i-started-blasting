const MAX_VISIBLE = 5;

export function TapeShelf({ tapes, onPlay }) {
  if (!tapes || tapes.length === 0) return null;

  const visible = tapes.slice(0, MAX_VISIBLE);

  return (
    <div className="tape-shelf">
      {visible.map((tape, i) => (
        <button
          key={tape.savedAt ?? i}
          className="tape-cassette"
          title={tape.name}
          onClick={() => onPlay(tape)}
          aria-label={`Play tape: ${tape.name}`}
        >
          <span className="tape-cassette-label">{tape.name}</span>
          {/* Reel windows */}
          <span className="tape-cassette-reel tape-cassette-reel-left" aria-hidden="true" />
          <span className="tape-cassette-reel tape-cassette-reel-right" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
