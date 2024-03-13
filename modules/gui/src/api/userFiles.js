import {WebSocket} from '~/http-client'

export default {
    userFiles: () => WebSocket('/api/user-files/ws'),
    downloadUrl: path => `/api/user-files/download?path=${encodeURIComponent(path)}`
}
