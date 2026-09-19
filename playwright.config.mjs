import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180000,
  expect: { timeout: 20000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:4174',
    viewport: { width: 800, height: 600 },
    // Touch-capable desktop exercises BALANCED; a dedicated desktop test covers HIGH.
    hasTouch: true,
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    ...['webgl','webgpu'].map(backend=>({
      name:`node-${backend}`,metadata:{backend},testMatch:'node-browser.spec.mjs',
      // The giant/volume scenes exceed three minutes on CI's software GPU.
      timeout:process.env.CI?300000:180000,
      use:{browserName:'chromium',hasTouch:false,viewport:{width:1280,height:800},
        launchOptions:{...(process.env.PLAYWRIGHT_CHANNEL?{channel:process.env.PLAYWRIGHT_CHANNEL}:{}),
          args:['--enable-webgl','--ignore-gpu-blocklist',...(process.env.CI?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[])]}}
    })),
    {
      name: 'chromium',
      testMatch: 'browser.spec.mjs',
      use: {
        browserName: 'chromium',
        launchOptions: {
          ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}),
          args: ['--disable-quic', '--enable-webgl', '--ignore-gpu-blocklist',
            ...(process.env.CI ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [])],
        },
      },
    },
    {
      name: 'webkit',
      testMatch: 'webkit.spec.mjs',
      use: { browserName: 'webkit', viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: process.env.TEST_BASE_URL ? undefined : {
    command: 'npm run serve',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
    timeout: 15000,
  },
});
