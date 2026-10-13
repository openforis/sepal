import {map} from 'rxjs'

import {get$} from '~/http-client'

import {moduleWebSocket$} from './ws.js'

export default {
    ws: () => moduleWebSocket$('user-data'),
    downloadUrl: path => `/api/user-data/attachments/data/download?path=${encodeURIComponent(path)}`,
    // Shaped as the home's listing (api.userFiles.listFiles$), so a folder field reads both alike.
    listFiles$: path =>
        get$('/api/user-data/attachments/data/files', {query: {path}}).pipe(
            map(({items}) => toListing(path, items))
        )
}

const toListing = (path, items = {}) => {
    const files = Object.entries(items).map(([name, {dir, size, mtime}]) => ({
        name,
        path: `${path}/${name}`,
        type: dir ? 'directory' : 'file',
        size,
        modifiedTime: mtime
    }))
    return {path, files, count: files.length}
}
