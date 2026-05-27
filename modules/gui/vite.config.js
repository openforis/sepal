import react from '@vitejs/plugin-react'
import {fileURLToPath, URL} from 'url'
import {defineConfig} from 'vite'

const recipesSrc = fileURLToPath(new URL('../../lib/js/recipes/src', import.meta.url))

// Pre-bundled deps live outside Vite's HMR graph and `node_modules` is ignored
// by the default watcher, so edits to the linked `recipes` source don't reach
// the running server. Watch the real path and restart on change; combined with
// optimizeDeps.force the rebundle picks up the new code.
function watchRecipesLib() {
    let timer = null
    return {
        name: 'watch-recipes-lib',
        configureServer(server) {
            server.watcher.add(recipesSrc)
            const scheduleRestart = file => {
                if (!file || !file.startsWith(recipesSrc)) return
                clearTimeout(timer)
                timer = setTimeout(() => {
                    server.config.logger.info(`[recipes] source changed; restarting Vite to rebundle.`)
                    server.restart()
                }, 100)
            }
            server.watcher.on('add', scheduleRestart)
            server.watcher.on('change', scheduleRestart)
            server.watcher.on('unlink', scheduleRestart)
        }
    }
}

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
    plugins: [react(), watchRecipesLib()],
    test: {
        globals: true,
        environment: 'happy-dom'
    },
})
