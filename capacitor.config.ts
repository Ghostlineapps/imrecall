import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.imrecall.mobile',
  appName: 'IMRECALL',
  webDir: 'public',
  server: {
    url: 'https://www.imrecall.app',
    cleartext: false
  }
};

export default config;
