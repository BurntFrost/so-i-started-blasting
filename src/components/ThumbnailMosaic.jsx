import { useState, useEffect, useRef, useMemo, memo } from "react";
import { SCENES } from "../data/scenes.js";

const SWAP_INTERVAL = 3500;
const TILE_COUNT = 20;

function thumbnailUrl(videoId) {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Generate stable random layout properties for each tile
function generateTileLayout() {
  return {
    x: rand(-5, 85),
    y: rand(-5, 85),
    width: rand(120, 220),
    rotation: rand(-12, 12),
    driftDuration: rand(30, 60),
    driftDelay: rand(-20, 0),
    driftX: rand(-80, 80),
    driftY: rand(-40, 40),
    driftRot: rand(-8, 8),
    opacity: rand(0.08, 0.18),
  };
}

const MosaicCell = memo(function MosaicCell({ videoId, layout }) {
  const [current, setCurrent] = useState(videoId);
  const [next, setNext] = useState(null);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (videoId === current) return;
    setNext(videoId);
    setFading(true);
  }, [videoId, current]);

  // Safety timeout in case onTransitionEnd doesn't fire (backgrounded tab, reduced-motion)
  useEffect(() => {
    if (!fading) return;
    const safety = setTimeout(() => {
      setCurrent(next);
      setNext(null);
      setFading(false);
    }, 1500);
    return () => clearTimeout(safety);
  }, [fading, next]);

  const handleTransitionEnd = () => {
    if (fading) {
      setCurrent(next);
      setNext(null);
      setFading(false);
    }
  };

  const style = {
    left: `${layout.x}%`,
    top: `${layout.y}%`,
    width: `${layout.width}px`,
    "--drift-x": `${layout.driftX}px`,
    "--drift-y": `${layout.driftY}px`,
    "--drift-rot": `${layout.driftRot}deg`,
    "--drift-duration": `${layout.driftDuration}s`,
    "--drift-delay": `${layout.driftDelay}s`,
    "--tile-rotation": `${layout.rotation}deg`,
    "--tile-opacity": layout.opacity,
  };

  return (
    <div className="mosaic-cell" style={style}>
      <img
        className={`mosaic-img ${fading ? "mosaic-img-out" : ""}`}
        src={thumbnailUrl(current)}
        alt=""
        draggable={false}
        onTransitionEnd={handleTransitionEnd}
      />
      {next && (
        <img
          className="mosaic-img mosaic-img-next"
          src={thumbnailUrl(next)}
          alt=""
          draggable={false}
        />
      )}
    </div>
  );
});

export function ThumbnailMosaic() {
  const youtubeScenes = useMemo(
    () => SCENES.filter((s) => !s.type || s.type === "youtube"),
    [],
  );

  const layouts = useMemo(
    () => Array.from({ length: TILE_COUNT }, (_, i) => generateTileLayout(i)),
    [],
  );

  const [grid, setGrid] = useState(() =>
    shuffle(youtubeScenes).slice(0, TILE_COUNT),
  );

  const gridRef = useRef(grid);
  gridRef.current = grid;

  useEffect(() => {
    const interval = setInterval(() => {
      const cellIndex = Math.floor(Math.random() * TILE_COUNT);
      const currentIds = new Set(gridRef.current.map((s) => s.videoId));
      const available = youtubeScenes.filter((s) => !currentIds.has(s.videoId));
      if (available.length === 0) return;

      const newScene = available[Math.floor(Math.random() * available.length)];
      setGrid((prev) => {
        const next = [...prev];
        next[cellIndex] = newScene;
        return next;
      });
    }, SWAP_INTERVAL);

    return () => clearInterval(interval);
  }, [youtubeScenes]);

  return (
    <div className="mosaic">
      {grid.map((scene, i) => (
        <MosaicCell key={i} videoId={scene.videoId} layout={layouts[i]} />
      ))}
    </div>
  );
}
