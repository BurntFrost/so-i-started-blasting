import './analytics.js';
import('./simulation.js?v=3').catch(()=>{document.getElementById('loading').hidden=true;document.getElementById('error').hidden=false;document.querySelectorAll('.transport button,.transport input,.scene-card').forEach(el=>el.disabled=true);});
