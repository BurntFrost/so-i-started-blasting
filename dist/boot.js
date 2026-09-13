import './analytics.js';
import { graphicsFailureStage, reportGraphicsFailure, showGraphicsFailure } from './runtime-state.js';

document.getElementById('retry')?.addEventListener('click', () => location.reload());
import('./simulation.js?v=3').catch(error => {
  const stage = graphicsFailureStage(error);
  // Renderer initialization reports its own scene before propagating a marked failure.
  if (stage === 'module-load') reportGraphicsFailure(stage);
  showGraphicsFailure(stage);
});
