import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { ncmPreview } from './scripts/ncm-preview.mjs';
export default defineConfig({
  plugins: [react(), ncmPreview()],
  define: {
    'process.env.TEST_NATIVE_PLATFORM': JSON.stringify('web'),
    'process.env.TAMAGUI_DYNAMIC_COLOR_IOS': JSON.stringify('0'),
  },
  resolve: { alias: { 'react-native-svg': '@tamagui/react-native-svg', 'react-native': 'react-native-web' } },
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: 'es2022' },
});
