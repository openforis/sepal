import {delay} from 'rxjs/operators'
import {postJson$} from 'http-client'

export default {
    loadPath$: path => postJson$('/api/files', {
        query: {path}
    }),

    updateTree$: tree => postJson$('/api/files', {
        query: {path: '/'},
        body: tree
    }),

    removePaths$: paths => postJson$('/api/files/delete', {
        body: paths
    }).pipe(
        delay(500)
    ),

    downloadUrl: path => `/api/files/download?path=${encodeURIComponent(path)}`
}
