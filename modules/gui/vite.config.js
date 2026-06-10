import react from '@vitejs/plugin-react'
import {fileURLToPath, URL} from 'url'
import {defineConfig} from 'vite'

const recipesSrc = fileURLToPath(new URL('../../lib/js/recipes/src', import.meta.url))
const sharedSrc = fileURLToPath(new URL('../../lib/js/shared/src', import.meta.url))
const guiRoot = fileURLToPath(new URL('.', import.meta.url))
const guiImporter = fileURLToPath(new URL('./index.html', import.meta.url))

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

// Files imported from the shared lib live outside the gui project, so bare
// imports they make (lodash, rxjs, ...) would resolve against a node_modules
// that doesn't exist next to them. Re-root any bare import coming from outside
// the gui project to gui's own node_modules, so locally installed packages win.
const resolveSharedDeps = {
    name: 'sepal:resolve-shared-deps',
    enforce: 'pre',
    async resolveId(source, importer) {
        if (importer && /^[a-zA-Z@]/.test(source) && !importer.startsWith(guiRoot)) {
            return this.resolve(source, guiImporter, {skipSelf: true})
        }
        return null
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
        allowedHosts: true,
        fs: {
            allow: [
                fileURLToPath(new URL('.', import.meta.url)),
                fileURLToPath(new URL('../../lib/js/shared', import.meta.url))
            ]
        }
    },
    build: {
        sourcemap: true
    },
    resolve: {
        alias: [
            {find: '~', replacement: fileURLToPath(new URL('./src', import.meta.url))},
            // `#sepal/recipes` is the shared recipes package (not part of the
            // shared lib's source tree), so it must match before the generic
            // `#sepal/*` rules below — Vite uses the first matching alias.
            {find: /^#sepal\/recipes$/, replacement: 'recipes'},
            {find: /^#sepal\/recipes\/(.*)$/, replacement: 'recipes/src/$1'},
            {find: /^#sepal\/(.*\.json)$/, replacement: `${sharedSrc}/$1`},
            {find: /^#sepal\/(.*)$/, replacement: `${sharedSrc}/$1.js`},
        ]
    },
    optimizeDeps: {
        // `recipes` is a file: dep linked into node_modules via a symlink.
        // Changes in linked dependencies do not reliably invalidate Vite's
        // optimized-deps cache. Rebuild on dev-server start so GUI validation
        // uses the current shared recipe schema/projection code.
        include: ['recipes'],
        force: true
    },
    plugins: [resolveSharedDeps, react(), watchRecipesLib()],
    test: {
        globals: true,
        environment: 'happy-dom'
    },
})
