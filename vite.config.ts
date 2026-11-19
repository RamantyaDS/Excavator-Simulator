import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves the site at /Excavator-Simulator/
export default defineConfig({
  base: '/Excavator-Simulator/',
  plugins: [react()],
});
