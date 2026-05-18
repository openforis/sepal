// Emits `value` exactly once when the source completes or errors, after
// any upstream values. Built-in endWith(v) only fires on completion;
// this also fires on error (before re-throwing).
//
// Used by TurnFlow so the channel always sees chat-response complete —
// whether the turn finishes naturally, errors, or is aborted via
// takeUntil (which surfaces as a normal completion upstream).

const {Observable} = require('rxjs')

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

module.exports = {emitOnEnd}
