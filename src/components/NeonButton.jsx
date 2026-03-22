export function NeonButton({ onClick, label = "Blast Me" }) {
  return (
    <button className="neon-btn" onClick={onClick}>
      🔫 {label}
    </button>
  );
}
