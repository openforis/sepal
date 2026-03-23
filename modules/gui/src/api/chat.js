import {moduleWebSocket$} from './ws.js'

export default {
    ws: () => moduleWebSocket$('mcp-server')
}
