import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    https: {
      key: fs.readFileSync(path.resolve(__dirname, '/key.pem')),
      cert: fs.readFileSync(path.resolve(__dirname, '/cert.pem')),
    },
    host: '0.0.0.0', // Listen on all network interfaces
    port: 5173,      // (Optional) Specify a port if needed
  }
})
