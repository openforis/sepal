import {moduleWebSocket$} from './ws.js'

export default {
    ws: () => moduleWebSocket$('user-data'),
    downloadUrl: path => `/api/user-data/attachments/data/download?path=${encodeURIComponent(path)}`,
}
