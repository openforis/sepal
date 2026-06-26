import react from '@vitejs/plugin-react'
import {fileURLToPath, URL} from 'url'
import {defineConfig} from 'vite'

const sharedSrc = fileURLToPath(new URL('../../lib/js/shared/src', import.meta.url))
const guiRoot = fileURLToPath(new URL('.', import.meta.url))
const guiImporter = fileURLToPath(new URL('./index.html', import.meta.url))

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
            {find: /^#sepal\/(.*\.json)$/, replacement: `${sharedSrc}/$1`},
            {find: /^#sepal\/(.*)$/, replacement: `${sharedSrc}/$1.js`},
        ]
    },
    plugins: [resolveSharedDeps, react()],
    test: {
        globals: true,
        environment: 'happy-dom'
    },
})
