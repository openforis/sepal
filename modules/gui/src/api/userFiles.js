import {get$} from '~/http-client'

import {moduleWebSocket$} from './ws.js'

export default {
    ws: () => moduleWebSocket$('user-files'),
    downloadUrl: path => `/api/user-files/download?path=${encodeURIComponent(path)}`,
    listFiles$: (path, options = {}) =>
        get$('/api/user-files/listFiles', {
            query: {path, ...options},
        }),
}
