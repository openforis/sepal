import {get$, post$} from 'http-client'
import {map} from 'rxjs/operators'

export default {
    loadAll$: () => get$('/api/apps/list').pipe(toResponse),
    requestSession$: endpoint => post$('/api/sandbox/start', {query: {endpoint: endpoint ? endpoint : 'shiny'}}),
    waitForSession$: endpoint => get$('/api/sandbox/start', {query: {endpoint: endpoint ? endpoint : 'shiny'}}),
}

const toResponse = map(e => e.response)
