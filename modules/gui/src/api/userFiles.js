import {moduleWebSocket$} from './ws.js'

export default {
    userFiles: () => moduleWebSocket$('user-files'),
    downloadUrl: path => `/api/user-files/download?path=${encodeURIComponent(path)}`
}
