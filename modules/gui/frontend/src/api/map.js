import {get$} from 'http-client'
import {map} from 'rxjs/operators'

export default {
    loadApiKey$: () => get$('/api/data/google-maps-api-key').pipe(toResponse)
}

const toResponse = map(e => e.response)
