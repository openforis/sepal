import {moduleWebSocket$} from './ws.js'

export default {
    ws: () => moduleWebSocket$('user-files'),
    downloadUrl: path => `/api/user-files/download?path=${encodeURIComponent(path)}`
}
