// Capture, probe, and compare the built renderer. Run against `npm run serve`.
import { chromium } from '@playwright/test';
import { existsSync, realpathSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

export const SCENES = [
  ['independence-day', 16], ['deep-impact', 22], ['day-after-tomorrow', 24],
  ['day-the-earth-stood-still', 22], ['terminator-2', 12], ['2012', 22],
  ['war-of-the-worlds', 20], ['knowing', 18], ['armageddon', 18],
  ['interstellar', 12], ['twister', 17], ['dantes-peak', 20], ['gravity', 15],
  ['wandering-earth', 23], ['evangelion', 25],
].map(([id, second]) => ({ id, second }));

export const QUALITY = {
  balanced: { viewport: { width: 590, height: 800 }, deviceScaleFactor: 1, hasTouch: false },
  high: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: false },
  ultra: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, hasTouch: false },
};

// dist/cinema.js measure() writes data-fps once per three seconds of rendered frames, after a three-second cooldown.
const GOVERNOR_WINDOW_SECONDS = 3, PROBE_SAMPLES = 2;
const PROBE_SECONDS = GOVERNOR_WINDOW_SECONDS * (PROBE_SAMPLES + 1);

const usage = `Usage:
  node tools/capture-media.mjs capture --quality balanced|high|ultra [--scene ID] [--output DIR] [--url URL]
  node tools/capture-media.mjs probe --quality high|ultra --scene ID --second N [--output DIR] [--url URL]
  node tools/capture-media.mjs compare BEFORE_DIR AFTER_DIR [--output DIR]`;

export function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift() || 'capture';
  if (!['capture', 'probe', 'compare'].includes(command)) throw new Error(`Unknown command: ${command}\n${usage}`);
  if (command === 'compare') {
    const directories = [];
    let output;
    while (args.length) {
      const value = args.shift();
      if (value === '--output') output = args.shift();
      else if (value?.startsWith('--')) throw new Error(`Unknown option: ${value}`);
      else directories.push(value);
    }
    if (directories.length !== 2) throw new Error(`compare requires BEFORE_DIR and AFTER_DIR\n${usage}`);
    if (!output) output = join(directories[1], 'diff');
    return { command, before: resolve(directories[0]), after: resolve(directories[1]), output: resolve(output) };
  }
  const options = { command, scenes: [] };
  while (args.length) {
    const key = args.shift();
    const value = args.shift();
    if (!['--quality', '--scene', '--second', '--output', '--url'].includes(key) || value === undefined) throw new Error(`Invalid option: ${key ?? ''}\n${usage}`);
    if (key === '--scene') options.scenes.push(...value.split(',').filter(Boolean));
    else options[key.slice(2)] = value;
  }
  if (!QUALITY[options.quality]) throw new Error(`--quality must be balanced, high, or ultra\n${usage}`);
  const unknown = options.scenes.filter(id => !SCENES.some(scene => scene.id === id));
  if (unknown.length) throw new Error(`Unknown scene: ${unknown.join(', ')}. Choose from ${SCENES.map(scene => scene.id).join(', ')}`);
  if (command === 'probe') {
    if (!['high', 'ultra'].includes(options.quality)) throw new Error('probe --quality must be high or ultra');
    if (options.scenes.length !== 1) throw new Error('probe requires exactly one --scene');
    options.second = Number(options.second);
    if (!Number.isFinite(options.second) || options.second < 0) throw new Error('probe --second must be a non-negative number of seconds');
  } else if (options.second !== undefined) throw new Error('--second is valid only for probe');
  options.output = resolve(options.output || `work/media-review-${options.quality}`);
  options.url ||= process.env.TEST_BASE_URL || 'http://127.0.0.1:4174';
  return options;
}

function selectedScenes(ids) { return ids.length ? SCENES.filter(scene => ids.includes(scene.id)) : SCENES; }

async function openPage(quality, url) {
  const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
  const errors = [];
  try {
    const page = await browser.newPage({ ...QUALITY[quality], reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', entry => { if (entry.type() === 'error' && /THREE|WebGL|shader/i.test(entry.text())) errors.push(entry.text()); });
    await page.goto(url);
    await page.locator('#world[data-authored-assets="ready"]').waitFor();
    const observed = await page.locator('#world').getAttribute('data-quality');
    if (observed !== quality) throw new Error(`Requested ${quality}, browser selected ${observed}`);
    return { browser, page, errors };
  } catch (error) {
    await browser.close();
    if (errors.length) error.message += `\nPage errors:\n${errors.join('\n')}`;
    throw error;
  }
}

// Shared with tests/browser.spec.mjs so the seek contract lives in one place.
export async function seekTimeline(page, seconds) {
  await page.locator('#progress').evaluate((input, time) => {
    input.value = String(time); input.dispatchEvent(new Event('input', { bubbles: true }));
  }, seconds);
}
// Two rendered frames settle transforms after an input; no wall-clock motion is running.
export function settleFrames(page) {
  return page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
}

async function selectAndSeek(page, scene, second) {
  await page.locator(`.scene-card[data-scene-id="${scene.id}"]`).click();
  await seekTimeline(page, second);
  await page.waitForFunction(id => {
    const data = document.querySelector('#world').dataset;
    const pending = [data.weatherTexture, data.nebulaTexture, data.particleAtlas].includes('loading') ||
      (id === 'terminator-2' && data.explosionBake === 'loading') ||
      (id === 'evangelion' && data.atFieldTexture === 'loading');
    return data.scene === id && !pending;
  }, scene.id);
  await settleFrames(page);
}

async function makeContactSheet(output, files) {
  const font = process.env.CAPTURE_FONT || '/System/Library/Fonts/Supplemental/Arial.ttf';
  if (!existsSync(font)) throw new Error(`Missing contact-sheet font: ${font}`);
  const result = spawnSync('magick', ['montage', ...files, '-font', font, '-set', 'label', '%t', '-thumbnail', '480x320', '-tile', '3x', '-geometry', '+12+24', join(output, 'contact-sheet.jpg')], { encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error(`ImageMagick montage failed: ${result.error?.message || result.stderr.trim()}`);
  return 'contact-sheet.jpg';
}

async function capture(options) {
  await mkdir(options.output, { recursive: true });
  const { browser, page, errors } = await openPage(options.quality, options.url);
  const frames = [];
  try {
    for (const scene of selectedScenes(options.scenes)) {
      await selectAndSeek(page, scene, scene.second);
      const file = `${scene.id}.png`;
      await page.locator('#player').screenshot({ path: join(options.output, file) });
      frames.push({ scene: scene.id, second: scene.second, file, metrics: await page.locator('#world').evaluate(canvas => ({ ...canvas.dataset })) });
    }
    const report = { mode: 'capture', quality: options.quality, frames, contactSheet: null, errors };
    // The manifest is what compare needs; the contact sheet is a convenience that must not take it down.
    try { report.contactSheet = await makeContactSheet(options.output, frames.map(frame => join(options.output, frame.file))); }
    finally { await writeFile(join(options.output, 'capture.json'), `${JSON.stringify(report, null, 2)}\n`); }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify({ screenshots: frames.length, quality: options.quality, output: options.output, contactSheet: report.contactSheet }));
  } finally { await browser.close(); }
}

async function probe(options) {
  await mkdir(options.output, { recursive: true });
  const scene = selectedScenes(options.scenes)[0];
  const { browser, page, errors } = await openPage(options.quality, options.url);
  try {
    const timelineMax = Number(await page.locator('#progress').getAttribute('max'));
    if (!Number.isFinite(timelineMax)) throw new Error('#progress has no numeric max');
    const latest = timelineMax - PROBE_SECONDS;
    if (options.second > latest) throw new Error(`probe --second must be at most ${latest} so ${PROBE_SAMPLES} data-fps samples fit before the ${timelineMax} s timeline ends`);
    await selectAndSeek(page, scene, options.second);
    await page.locator('#world').evaluate(canvas => {
      window.__captureFpsSamples = [];
      new MutationObserver(() => window.__captureFpsSamples.push(Number(canvas.dataset.fps)))
        .observe(canvas, { attributes: true, attributeFilter: ['data-fps'] });
    });
    await page.locator('#play').click();
    try {
      await page.waitForFunction(count => window.__captureFpsSamples.length >= count, PROBE_SAMPLES, { timeout: (timelineMax - options.second + 1) * 1000 });
    } catch (error) {
      if (error.name !== 'TimeoutError') throw error;
      throw new Error(`Probe collected fewer than ${PROBE_SAMPLES} data-fps samples before the timeline ended`);
    }
    if (await page.locator('#play').getAttribute('aria-label') === 'Pause simulation') await page.locator('#play').click();
    const result = await page.locator('#world').evaluate(canvas => ({ requestedTier: canvas.dataset.qualityCeiling, finalTier: canvas.dataset.quality,
      fps: Number(canvas.dataset.fps), samples: window.__captureFpsSamples, metrics: { ...canvas.dataset } }));
    if (result.samples.some(value => !Number.isFinite(value))) throw new Error('Probe recorded a non-numeric data-fps sample');
    const report = { mode: 'probe', scene: scene.id, second: options.second, requiredSamples: PROBE_SAMPLES, quality: options.quality, ...result, errors };
    await writeFile(join(options.output, `probe-${scene.id}-${options.quality}.json`), `${JSON.stringify(report, null, 2)}\n`);
    if (errors.length) throw new Error(errors.join('\n'));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
}

export async function loadCaptureSet(directory) {
  const manifestPath = join(directory, 'capture.json');
  if (!existsSync(manifestPath)) throw new Error(`Missing capture: ${manifestPath}`);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest.frames) || !manifest.frames.length) throw new Error(`Capture has no frames: ${manifestPath}`);
  const frames = new Map();
  for (const frame of manifest.frames) {
    if (!frame.scene || !frame.file) throw new Error(`Invalid frame in ${manifestPath}`);
    const file = join(directory, basename(frame.file));
    if (!existsSync(file)) throw new Error(`Missing capture image: ${file}`);
    if (frames.has(frame.scene)) throw new Error(`Duplicate scene ${frame.scene} in ${manifestPath}`);
    frames.set(frame.scene, file);
  }
  return frames;
}

export function validateSceneSets(before, after) {
  const beforeScenes = [...before.keys()].sort(), afterScenes = [...after.keys()].sort();
  if (JSON.stringify(beforeScenes) !== JSON.stringify(afterScenes)) throw new Error(`Capture scene sets differ: before=${beforeScenes.join(',')} after=${afterScenes.join(',')}`);
  return beforeScenes;
}

export function parseAbsoluteError(output) {
  // ImageMagick prints counts of a million or more as 4.096e+06 unless -precision raises the digits; Number() reads both.
  const [token] = output.trim().split(/\s+/);
  const pixels = token ? Number(token) : NaN;
  if (!Number.isFinite(pixels)) throw new Error('ImageMagick returned no pixel count');
  return pixels;
}

export function parseNormalizedError(output) {
  const inner = output.match(/\(([^)]*)\)\s*$/)?.[1]?.trim();
  const value = inner ? Number(inner) : NaN;
  if (!Number.isFinite(value)) throw new Error('ImageMagick returned no normalized error');
  return value;
}

function parseMetric(scene, metric, parse, before, after, target) {
  const result = spawnSync('magick', ['compare', '-precision', '15', '-metric', metric, before, after, target], { encoding: 'utf8' });
  if (result.error || ![0, 1].includes(result.status)) throw new Error(`ImageMagick ${metric} compare failed for ${scene}: ${result.error?.message || result.stderr.trim()}`);
  try { return parse(result.stderr || result.stdout); }
  catch (error) { throw new Error(`${error.message} for ${scene}`); }
}

async function compare(options) {
  const [before, after] = await Promise.all([loadCaptureSet(options.before), loadCaptureSet(options.after)]);
  const beforeScenes = validateSceneSets(before, after);
  await mkdir(options.output, { recursive: true });
  const differences = [];
  for (const scene of beforeScenes) {
    const diff = join(options.output, `${scene}.png`);
    // ImageMagick 7's AE is 0 for identical frames and otherwise adds each changed pixel's normalized colour distance, so it
    // only counts pixels for full-range changes; RMSE alongside it separates a subtle full-frame regrade from a broken scene.
    const absoluteError = parseMetric(scene, 'AE', parseAbsoluteError, before.get(scene), after.get(scene), diff);
    const rmse = parseMetric(scene, 'RMSE', parseNormalizedError, before.get(scene), after.get(scene), 'null:');
    differences.push({ scene, absoluteError, rmse, file: `${scene}.png` });
    console.log(`${scene}\t${absoluteError}\t${rmse}`);
  }
  await makeContactSheet(options.output, differences.map(item => join(options.output, item.file)));
  await writeFile(join(options.output, 'compare.json'), `${JSON.stringify({ before: options.before, after: options.after, differences }, null, 2)}\n`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.command === 'capture') return capture(options);
  if (options.command === 'probe') return probe(options);
  return compare(options);
}

// Compare real paths: Node resolves the entry module through symlinks but leaves process.argv[1] as typed.
if (process.argv[1] && existsSync(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
