import { defineConfig } from 'vite';
import path from 'path';
export default defineConfig({
    root: 'src/renderer',
    publicDir: 'public',
    build: {
        outDir: '../../dist/renderer',
        emptyOutDir: true,
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    define: {
        'process.env': {},
    },
    base: './',
    server: {
        port: 3000,
    }
});
