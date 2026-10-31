import './analytics.js';
import { graphicsFailureStage, reportGraphicsFailure, showGraphicsFailure } from './runtime-state.js';

// Optional typography must never delay scene startup when its service is unavailable.
const fonts = document.getElementById('optional-fonts');
if (fonts?.sheet) fonts.media = 'all';
else fonts?.addEventListener('load', () => { fonts.media = 'all'; }, { once: true });

document.getElementById('retry')?.addEventListener('click', () => location.reload());
import('./simulation.js?v=3').catch(error => {
  const stage = graphicsFailureStage(error);
  // Renderer initialization reports its own scene before propagating a marked failure.
  if (stage === 'module-load') reportGraphicsFailure(stage);
  showGraphicsFailure(stage);
});
