# Cinema environment and surface assets

The HDR environment and texture maps below are CC0 1.0 under Poly Haven's verified asset license: https://polyhaven.com/license

Downloaded 2026-09-13. Every original payload's MD5 matched Poly Haven's public API metadata. The table below records the original downloads. The six JPEG texture maps were converted to the corresponding `.webp` files with ImageMagick at quality 86 for deployment; `dusk.hdr` is unchanged.

| File | Bytes | Source download |
|---|---:|---|
| dusk.hdr | 1526564 | https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/the_sky_is_on_fire_1k.hdr |
| concrete-albedo.jpg | 543902 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_diff_1k.jpg |
| concrete-normal.jpg | 114447 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_nor_gl_1k.jpg |
| concrete-roughness.jpg | 215714 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete/concrete_rough_1k.jpg |
| asphalt-albedo.jpg | 914719 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/worn_asphalt/worn_asphalt_diff_1k.jpg |
| asphalt-normal.jpg | 1503498 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/worn_asphalt/worn_asphalt_nor_gl_1k.jpg |
| asphalt-roughness.jpg | 480395 | https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/worn_asphalt/worn_asphalt_rough_1k.jpg |

Original image payload: 5,299,239 bytes. Deployed WebP maps plus HDR: 2,792,450 bytes. All texture maps are 1024 x 1024. HDR is 1K Radiance format.

Asset pages:
- The Sky Is On Fire, Greg Zaal (HDRI): https://polyhaven.com/a/the_sky_is_on_fire
- Concrete, Rob Tuytel (4 m tile): https://polyhaven.com/a/concrete
- Worn Asphalt, Amal Kumar (2 m tile): https://polyhaven.com/a/worn_asphalt

API metadata sources:
- https://api.polyhaven.com/files/the_sky_is_on_fire
- https://api.polyhaven.com/files/concrete
- https://api.polyhaven.com/files/worn_asphalt

Three.js integration: albedo uses SRGBColorSpace. Normal and roughness maps use NoColorSpace. Normals are OpenGL +Y convention. Use RepeatWrapping at the physical tile scale and PMREM filtering for the HDR environment. The HDRI includes a seaside promenade; use it for reflected light or a sky hemisphere where ground geometry occludes the lower hemisphere, rather than presenting the lower panorama as a new city model.
