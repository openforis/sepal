import {WebSocket} from 'http-client'

export default {
    userFiles: () => WebSocket('/api/user-files')
}
