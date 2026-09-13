# Graphics asset pipeline

`author-assets.py` is the original Blender source for five architectural templates,
a branching tree, and the mothership. Run with Blender 5.2 in background mode.
It writes editable Blender scenes, GLBs, and statistics to `/tmp/blasting-models`.
The `*-v2.glb` files are the final authored assets.

```sh
blender --background --factory-startup --python tools/author-assets.py
gltf-transform meshopt /tmp/blasting-models/city-kit-v2.glb dist/assets/city-kit.glb --level high
gltf-transform meshopt /tmp/blasting-models/mothership-v2.glb dist/assets/mothership.glb --level high
gltf-transform validate dist/assets/city-kit.glb
gltf-transform validate dist/assets/mothership.glb
```

The runtime registers MeshoptDecoder, expands normalized integer geometry before
baking template transforms, and uses instancing for both detailed and Lite city
geometry. The validator reports no errors or warnings, but does not itself
validate EXT_meshopt_compression; browser loading provides that integration check.

Texture provenance and CC0 licensing are documented in `dist/assets/SOURCES.md`.
The six 1024px JPEG maps were converted with ImageMagick at WebP quality 86.
Albedo is sRGB; normal and roughness remain linear. The Radiance HDR supplies
both the sky and the PMREM reflection environment.

No graphics assets require a remote generation service at runtime.
