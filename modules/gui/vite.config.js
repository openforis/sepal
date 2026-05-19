import react from '@vitejs/plugin-react'
import {fileURLToPath, URL} from 'url'
import {defineConfig} from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
    define: {
        'process.env.POLYGON_CLIPPING_MAX_QUEUE_SIZE': 10000,
        'process.env.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS': 10000,
    },

    server: {
        host: '0.0.0.0',
        port: 80,
        allowedHosts: true
    },
    build: {
        sourcemap: true
    },
    resolve: {
        alias: [
            {find: '~', replacement: fileURLToPath(new URL('./src', import.meta.url))},
        ]
    },
    optimizeDeps: {
        // `recipes` is a file: dep linked into node_modules via a symlink.
        // Vite skips pre-bundling of linked packages by default (to keep HMR
        // working on the linked source), but the recipes package is CJS, so
        // without pre-bundling the browser sees raw `module.exports = {...}`
        // and named imports fail. Force it through esbuild's CJS->ESM.
        //
        // Changes in linked dependencies do not reliably invalidate Vite's
        // optimized-deps cache. Rebuild on dev-server start so GUI validation
        // uses the current shared recipe schema/projection code.
        include: ['recipes'],
        force: true
    },
    plugins: [react()],
    test: {
        globals: true,
        environment: 'happy-dom'
    },
})
