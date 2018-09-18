import {get$} from 'http-client'
import {map} from 'rxjs/operators'

export default {
    init$: () => get$('/api/gateone/auth-object').pipe(toResponse)
}

const toResponse = map(e => e.response)
