import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.mossmind.app',
  appName: 'MossMind',
  webDir: 'dist/mobile',
  plugins: {
    Preferences: {
      group: 'MossMindStore',
    },
  },
  ios: {
    backgroundColor: '#1E1C26',
    contentInset: 'always',
  },
}

export default config
