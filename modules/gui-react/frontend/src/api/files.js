import {delete$, get$} from 'http-client'
import {map} from 'rxjs/operators'

export default {
    loadFiles$: (path) => get$('/api/files?path=' + encodeURIComponent(path)).pipe(toResponse),
    removeItem$: (path) => delete$('/api/files/' + encodeURIComponent(path)).pipe(toResponse)
}

const toResponse = map(e => e.response)
