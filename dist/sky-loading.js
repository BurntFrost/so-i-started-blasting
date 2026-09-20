// Decide whether to download the sharper panorama after the base assets settle.
// quality is the current tier, ceiling is the startup tier, connection is optional.
// Returns true only when the extra download is appropriate for this visitor.
export function shouldUpgradeSky({ quality, ceiling, connection }) {
  if (quality !== 'ultra' || ceiling !== 'ultra') return false;
  if (connection?.saveData) return false;
  if (['slow-2g', '2g', '3g'].includes(connection?.effectiveType)) return false;
  return true;
}
