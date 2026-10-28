import {AsyncLocalStorage} from 'node:async_hooks'

import {Observable} from 'rxjs'

// Delivers every notification of `source$` - next, error and complete - in the asynchronous context its subscriber
// subscribed in, captured whole (AsyncLocalStorage.snapshot) at each subscription. Where an answer is produced is no
// concern of whoever receives it: a read shared between subscribers emits in the context of whichever started it,
// and a transport's response in that of its message handler. Synchronous: no notification is delayed or reordered,
// and unsubscribing reaches the source as before. Node only.
export const inSubscriberContext = source$ => new Observable(subscriber => {
    const inContext = AsyncLocalStorage.snapshot()
    return source$.subscribe({
        next: value => inContext(() => subscriber.next(value)),
        error: error => inContext(() => subscriber.error(error)),
        complete: () => inContext(() => subscriber.complete())
    })
})
