import react from '@vitejs/plugin-react-swc'
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
        port: 3000,
    },
    resolve: {
        alias: [
            {find: '~', replacement: fileURLToPath(new URL('./src', import.meta.url))},
        ]
    },
    plugins: [react()],
    test: {
        globals: true,
        environment: 'happy-dom'
    },
})
