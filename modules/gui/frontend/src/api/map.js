import {get$} from 'http-client'
import {map} from 'rxjs/operators'

export default {
    loadApiKeys$: () => get$('/api/data/map-api-keys').pipe(toResponse)
}

const toResponse = map(e => e.response)
