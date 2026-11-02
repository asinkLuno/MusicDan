import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ plugins: [react()], resolve: { alias: { 'react-native-svg': '@tamagui/react-native-svg', 'react-native': 'react-native-web' } }, clearScreen: false, server: { port: 1420, strictPort: true }, build: { target: 'es2022' } });
