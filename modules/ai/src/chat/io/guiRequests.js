const {Subject, defer, finalize, map, merge, take} = require('rxjs')

function createGuiRequests({clock, createId, timeoutMs}) {
    const pending = new Map()

    return {request$, respond, cancelForSubscription}

    function request$({channel, clientId, subscriptionId, action, params}) {
        return defer(() => {
            const requestId = createId()
            const outcome$ = new Subject()
            pending.set(requestId, {outcome$, subscriptionKey: keyOf({clientId, subscriptionId})})
            channel.guiAction({requestId, action, params})
            return merge(
                outcome$,
                clock.delay$(timeoutMs).pipe(map(() => {
                    throw new Error(`GUI request '${action}' timed out`)
                }))
            ).pipe(
                take(1),
                finalize(() => pending.delete(requestId))
            )
        })
    }

    function respond({requestId, clientId, subscriptionId, success, data, error}) {
        const entry = pending.get(requestId)
        const fromOwningSubscription = entry?.subscriptionKey === keyOf({clientId, subscriptionId})
        if (fromOwningSubscription) {
            if (success) {
                entry.outcome$.next(data)
            } else {
                entry.outcome$.error(new Error(error?.message || 'GUI request failed'))
            }
        }
    }

    function cancelForSubscription({clientId, subscriptionId}) {
        const key = keyOf({clientId, subscriptionId})
        for (const entry of pending.values()) {
            if (entry.subscriptionKey === key) {
                entry.outcome$.error(new Error('GUI request cancelled'))
            }
        }
    }
}

function keyOf({clientId, subscriptionId}) {
    return `${clientId}:${subscriptionId}`
}

module.exports = {createGuiRequests}
