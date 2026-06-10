// Emits `value` exactly once when the source completes or errors
// (built-in endWith only fires on completion).

import {Observable} from 'rxjs'

function emitOnEnd(value) {
    return source$ => new Observable(subscriber => {
        let emitted = false
        const emit = () => {
            if (!emitted) {
                emitted = true
                subscriber.next(value)
            }
        }
        const sub = source$.subscribe({
            next: v => subscriber.next(v),
            error: e => {
                emit()
                subscriber.error(e)
            },
            complete: () => {
                emit()
                subscriber.complete()
            }
        })
        return () => sub.unsubscribe()
    })
}

export {emitOnEnd}
