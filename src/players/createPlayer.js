// src/players/createPlayer.js
import { YouTubePlayer } from "./YouTubePlayer.js";
import { VimeoPlayer } from "./VimeoPlayer.js";
import { StreamablePlayer } from "./StreamablePlayer.js";
import { DailymotionPlayer } from "./DailymotionPlayer.js";
import { DirectVideoPlayer } from "./DirectVideoPlayer.js";

const PLAYERS = {
  youtube: YouTubePlayer,
  vimeo: VimeoPlayer,
  streamable: StreamablePlayer,
  dailymotion: DailymotionPlayer,
  video: DirectVideoPlayer,
};

/**
 * Create a new player instance for the given scene type.
 * @param {string} [type="youtube"] - One of: youtube, vimeo, streamable, dailymotion, video
 * @returns {YouTubePlayer|VimeoPlayer|StreamablePlayer|DailymotionPlayer|DirectVideoPlayer}
 */
export function createPlayer(type = "youtube") {
  const PlayerClass = PLAYERS[type];
  if (!PlayerClass) {
    console.warn(`Unknown player type "${type}", falling back to YouTube`);
    return new YouTubePlayer();
  }
  return new PlayerClass();
}

/**
 * Get the resolved type for a scene (defaults to "youtube" if missing).
 * @param {object} scene
 * @returns {string}
 */
export function getSceneType(scene) {
  return scene?.type || "youtube";
}
