import {delay, map} from 'rxjs/operators'
import {postJson$} from 'http-client'

export default {
    loadPath$: path => postJson$('/api/files', {
        query: {path}
    }).pipe(toResponse),

    updateTree$: tree => postJson$('/api/files', {
        query: {path: '/'},
        body: tree
    }).pipe(toResponse),

    removePaths$: paths => postJson$('/api/files/delete', {
        body: paths
    }).pipe(
        delay(500),
        toResponse
    ),

    downloadUrl: path => `/api/files/download?path=${encodeURIComponent(path)}`
}

const toResponse = map(e => e.response)
