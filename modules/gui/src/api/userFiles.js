import {get$, post$} from '~/http-client'

import {moduleWebSocket$} from './ws.js'

export default {
    ws: () => moduleWebSocket$('user-files'),
    downloadUrl: path => `/api/user-files/download?path=${encodeURIComponent(path)}`,
    listFiles$: (path, options = {}) =>
        get$('/api/user-files/listFiles', {
            query: {path, ...options},
        }),
    createFolder$: path =>
        post$('/api/user-files/createFolder', {
            query: {path, recursive: true},
        }),
}
