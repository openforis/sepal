import {AsyncLocalStorage} from 'node:async_hooks'

import {Observable} from 'rxjs'

// Who the Earth Engine calls of one request are made as, and where they go. Held in AsyncLocalStorage for
// the reason the recipe scope is: calls are reached from recipe code with no parameter to carry it in.
const storage = new AsyncLocalStorage()

export const DEFAULT_EE_ENDPOINT = 'https://earthengine.googleapis.com'

export const inEEContext = (context, source$) =>
    new Observable(subscriber => storage.run(context, () => source$.subscribe(subscriber)))

export const currentEEContext = () => {
    const context = storage.getStore()
    if (!context) {
        throw new Error('No Earth Engine context: an Earth Engine call was made outside a request')
    }
    return context
}
