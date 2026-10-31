import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { scenes } from '../../../../dist/scenes.js';

const root = fileURLToPath(new URL('../../../../', import.meta.url));
const factory = new URL('../../blasting-scene-build/assets/scene-factory.js', import.meta.url);
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = value => typeof value === 'string' && value.trim().length > 0;
const vector = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
const color = value => typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value);

export function createDraft(id, title) {
  if (typeof id !== 'string' || !slug.test(id) || id.length > 64) throw new Error('Use a scene ID of at most 64 lowercase letters, digits and single hyphens.');
  if (!text(title)) throw new Error('Supply the film title.');
  const existing = scenes.find(scene => scene.id === id);
  return {
    version: 1, id, operation: existing ? 'refine' : 'create',
    film: { title, year: existing ? Number(existing.year) : null, moment: '', sources: [] },
    intent: '', world: existing?.world || 'city', renderer: existing?.renderer || 'terrestrial', duration: 30,
    signature: [],
    beats: [
      { start: 0, end: 8, label: 'ANTICIPATION', action: '' },
      { start: 8, end: 22, label: 'EVENT', action: '' },
      { start: 22, end: 30, label: 'AFTERMATH', action: '' },
    ],
    camera: { position: [...(existing?.camera || [122, 58, 155])], target: [...(existing?.target || [-8, 35, -15])] },
    look: { accent: existing?.color || '#ff9852', sky: existing?.sky || '#171f22' },
    quality: { lite: '', balanced: '', high: '', ultra: '' },
    audio: { direction: '', cues: [] }, assets: [], captureSeconds: [3, 15, 27],
    acceptance: [], assumptions: [],
  };
}

export function validateBrief(brief, catalogue = scenes) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  if (!brief || typeof brief !== 'object' || Array.isArray(brief)) return ['Brief must be a JSON object.'];
  require(brief.version === 1, 'version must be 1.');
  require(typeof brief.id === 'string' && slug.test(brief.id) && brief.id.length <= 64, 'id must be a lowercase slug of at most 64 characters.');
  require(['create', 'refine'].includes(brief.operation), 'operation must be create or refine.');
  const existing = catalogue.find(scene => scene.id === brief.id);
  if (brief.operation === 'create') require(!existing, 'create requires an unused scene ID; use refine for an existing scene.');
  if (brief.operation === 'refine') require(Boolean(existing), 'refine requires an existing scene ID.');
  require(text(brief.film?.title) && text(brief.film?.moment), 'film.title and film.moment are required.');
  require(brief.film?.year === null || (Number.isInteger(brief.film?.year) && brief.film.year >= 1888 && brief.film.year <= 9999), 'film.year must be a four-digit year or null.');
  require(Array.isArray(brief.film?.sources) && brief.film.sources.every(source => {
    try { return ['https:', 'http:'].includes(new URL(source?.url).protocol) && text(source?.observation); }
    catch { return false; }
  }), 'film.sources must contain URL/observation pairs (or be empty).');
  require(text(brief.intent), 'intent is required.');
  require(['city', 'landscape', 'space'].includes(brief.world), 'world must be city, landscape or space.');
  const rendererValid = brief.world === 'space' ? brief.renderer === 'cosmic' :
    brief.renderer === 'terrestrial' || (brief.operation === 'refine' && existing?.renderer === 'original' && brief.renderer === 'original' && brief.world === existing.world);
  require(rendererValid, 'renderer must match world; original is reserved for refining its existing scene.');
  require(brief.duration === 30, 'duration must be 30 seconds.');
  for (const key of ['signature', 'acceptance']) {
    require(Array.isArray(brief[key]) && brief[key].length > 0 && brief[key].every(text), `${key} must contain concrete nonempty descriptions.`);
  }
  require(Array.isArray(brief.assumptions) && brief.assumptions.every(text), 'assumptions must be an array of nonempty strings (or empty).');
  const beats = Array.isArray(brief.beats) ? brief.beats : [];
  require(beats.length === 3, 'Supply exactly three beats.');
  let end = 0;
  for (const [index, beat] of beats.entries()) {
    require(Number.isFinite(beat?.start) && Number.isFinite(beat?.end) && beat.start === end && beat.end > beat.start && beat.end <= 30, `Beat ${index + 1} must continue the timeline without gaps or overlaps.`);
    require(text(beat?.label) && text(beat?.action), `Beat ${index + 1} needs a label and visible action.`);
    end = beat?.end;
  }
  require(end === 30, 'Beats must end at 30 seconds.');
  require(vector(brief.camera?.position) && vector(brief.camera?.target) && brief.camera.position.some((n, i) => n !== brief.camera.target[i]), 'camera requires distinct finite XYZ position and target.');
  require(color(brief.look?.accent) && color(brief.look?.sky), 'look requires six-digit hex accent and sky colors.');
  for (const tier of ['lite', 'balanced', 'high', 'ultra']) require(text(brief.quality?.[tier]), `Describe the ${tier} quality treatment.`);
  require(text(brief.audio?.direction), 'audio.direction must describe the original sound bed.');
  require(Array.isArray(brief.audio?.cues) && brief.audio.cues.every((cue, i, cues) => Number.isFinite(cue?.at) && cue.at > 0 && cue.at < 30 && (i === 0 || cue.at >= cues[i - 1]?.at) && text(cue?.description)), 'audio.cues must be sorted, described and strictly inside 0–30 seconds.');
  require(Array.isArray(brief.assets) && brief.assets.every(asset => text(asset?.path) && /^\/assets\/[a-zA-Z0-9/_-]+\.[a-z0-9]+$/.test(asset.path) && text(asset?.provenance) && text(asset?.fallback)), 'assets need literal local /assets/ paths, provenance and fallback (or an empty array).');
  const captures = brief.captureSeconds;
  require(Array.isArray(captures) && captures.length >= 3 && captures.every((at, i) => Number.isFinite(at) && at >= 0 && at <= 30 && (i === 0 || at > captures[i - 1])) && beats.every(beat => captures.some(at => at > beat?.start && at < beat?.end)), 'captureSeconds must be sorted, unique, in range, and include a time inside each beat.');
  return errors;
}

export async function initBrief(id, title, outputRoot = root) {
  const brief = createDraft(id, title);
  const parent = join(outputRoot, 'work', 'scene-authoring');
  await mkdir(parent, { recursive: true });
  const directory = join(parent, id);
  // An existing directory may hold a user's creative work, even without a brief.
  await mkdir(directory);
  await writeFile(join(directory, 'brief.json'), `${JSON.stringify(brief, null, 2)}\n`, { flag: 'wx' });
  await copyFile(factory, join(directory, 'scene.mjs'), constants.COPYFILE_EXCL);
  return directory;
}

export async function main(args) {
  const [command, input, title] = args;
  if (command === 'init' && args.length === 3) {
    const directory = await initBrief(input, title);
    console.log(`Created ${directory}\nFill the creative brief fields, then validate. The factory is an example, not an integrated movie scene.`);
  } else if (command === 'validate' && args.length === 2) {
    const errors = validateBrief(JSON.parse(await readFile(input, 'utf8')));
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(`Valid scene brief: ${input}`);
  } else {
    throw new Error('Usage: node scene-brief.mjs init SCENE_ID "Film title" | validate PATH');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
