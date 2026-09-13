export const projectId = 'prj_t9xPKJ22rXL1adwZON1A1FH4pWr6';
export const repository = 'BurntFrost/so-i-started-blasting';

export function deploymentUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash
    || url.pathname !== '/' || !/^so-i-started-blasting-[a-z0-9]{9}-burntfrosts-projects\.vercel\.app$/.test(url.hostname)) {
    throw new Error('invalid-deployment-url');
  }
  return url.origin;
}

export function validateRelease(metadata, expected = metadata) {
  if (!metadata || !expected || !/^dpl_[a-zA-Z0-9]+$/.test(metadata.deploymentId)
    || !/^[a-f0-9]{40}$/.test(metadata.sha) || metadata.projectId !== projectId
    || !['production', 'preview'].includes(metadata.environment)) throw new Error('invalid-release-metadata');
  const url = deploymentUrl(metadata.url);
  for (const key of ['deploymentId', 'sha', 'projectId', 'environment']) {
    if (metadata[key] !== expected[key]) throw new Error(`release-${key}-mismatch`);
  }
  if (url !== deploymentUrl(expected.url)) throw new Error('release-url-mismatch');
  return { deploymentId: metadata.deploymentId, url, sha: metadata.sha, projectId, environment: metadata.environment };
}

export function createReleaseMetadata(env = process.env) {
  if (env.VERCEL !== '1') return null;
  return validateRelease({
    deploymentId: env.VERCEL_DEPLOYMENT_ID,
    url: `https://${env.VERCEL_URL}`,
    sha: env.VERCEL_GIT_COMMIT_SHA,
    projectId: env.VERCEL_PROJECT_ID,
    environment: env.VERCEL_ENV,
  });
}
