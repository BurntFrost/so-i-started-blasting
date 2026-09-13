// Optional authored assets must never hold procedural startup open indefinitely.
export async function loadOptionalAssets(loads, { timeoutMs = 15_000, signal } = {}) {
  const results = await Promise.allSettled(loads.map(load => new Promise((resolve, reject) => {
    let settled = false;
    let timer;
    const finish = (settle, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      settle(value);
    };
    const abort = () => finish(reject, new DOMException('Asset loading cancelled', 'AbortError'));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(reject, new Error('Optional asset loading timed out')), timeoutMs);
    Promise.resolve().then(() => settled ? null : load()).then(value => {
      if (settled) disposeAsset(value);
      else finish(resolve, value);
    }, error => finish(reject, error));
  })));
  if (signal?.aborted) {
    for (const result of results) if (result.status === 'fulfilled') disposeAsset(result.value);
    throw new DOMException('Asset loading cancelled', 'AbortError');
  }
  return results;
}

// Timed-out loaders can still finish decoding. Release their unadopted resources.
export function disposeAsset(asset) {
  const disposed = new Set();
  const dispose = resource => {
    if (!resource || disposed.has(resource)) return;
    disposed.add(resource);
    if (resource.isTexture) {
      const image = resource.source?.data;
      if (image?.close && !disposed.has(image)) { disposed.add(image); image.close(); }
    }
    resource.dispose?.();
  };
  if (asset?.isTexture) { dispose(asset); return; }
  for (const scene of new Set([asset?.scene, ...(asset?.scenes || [])])) scene?.traverse(object => {
    dispose(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      for (const value of Object.values(material)) if (value?.isTexture) dispose(value);
      dispose(material);
    }
    dispose(object.skeleton);
  });
}
