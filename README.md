# So I Started Blasting

An interactive 3D apocalypse cinema at [soistartedblasting.com](https://soistartedblasting.com/), with original scenes inspired by *Independence Day*, *Deep Impact*, *The Day After Tomorrow*, and *Melancholia*.

The simulation includes authored architectural and spacecraft models, physically based surface materials, HDR lighting, animated weather and particles, and adaptive graphics quality for phones. Scene playback, timeline scrubbing, camera orbit, replay, and graphics controls run entirely in the browser.

## Run locally

From the repository root:

```sh
python3 -m http.server 4173 --directory dist
```

Open <http://localhost:4173>. Use an HTTP server rather than opening the HTML file directly. A WebGL-capable browser and an internet connection are required: Three.js 0.170.0 and its addons load from jsDelivr, and fonts load from Google Fonts. Models, texture maps, and the HDR environment are included in this repository.

There is no package installation, bundling step, backend, or required environment variable.

## Code and assets

| Path | Purpose |
| --- | --- |
| `dist/index.html`, `dist/style.css` | Interface and layout |
| `dist/boot.js` | Browser startup and failure handling |
| `dist/simulation.js` | Scene construction, animation, camera, and controls |
| `dist/cinema.js` | Materials, effects, and adaptive graphics |
| `dist/production.js` | Model loading, instancing, and environment setup |
| `dist/assets/` | Compressed GLB models, WebP textures, HDR, and provenance |
| `tools/author-assets.py` | Blender source for the original procedural models |
| `tools/README.md` | Asset rebuilding and compression commands |
| `.openai/hosting.json` | Existing Sites project and static output configuration |
| `vercel.json` | Static deployment configuration for the connected Vercel project |

See [the asset pipeline](tools/README.md) for rebuilding the models, and [asset sources](dist/assets/SOURCES.md) for Poly Haven texture and environment credits under CC0. Film titles identify visual inspiration; this is an unofficial interactive tribute.

## Deployment

Serve the contents of `dist` at the website root. The checked-in files are the deployable source, so edits do not need a build step.

The public domain currently serves the Sites deployment. Its Cloudflare access policy is managed separately. The Vercel configuration also serves `dist`, skips package installation and builds, and retains the existing Vercel project alias redirect to the public domain. Unversioned assets revalidate on subsequent visits so updates do not remain cached for a year.

This replacement preserves the previous video-clip application in Git history. Its API functions, scheduled clip checks, and package dependencies are no longer part of the current application.
