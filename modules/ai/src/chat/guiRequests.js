// Server→browser request/response bridge. request$ emits a gui-action
// channel event, then yields the matching gui-response when the GUI
// replies. Subscription teardown cancels outstanding requests.

const {Subject, concat, defer, finalize, map, merge, of, take} = require('rxjs')
const {emitChannel, guiAction} = require('./channelEvents')

function createGuiRequests({clock, createId, timeoutMs, bus}) {
    const pending = new Map()

    return {request$, respond, cancelForSubscription}

    function request$({clientId, subscriptionId, action, params}) {
        return defer(() => {
            const requestId = createId()
            const subscriptionKey = keyOf({clientId, subscriptionId})
            const outcome$ = new Subject()
            pending.set(requestId, {outcome$, subscriptionKey, action})
            publishRequestSent({requestId, action, subscriptionKey})
            return concat(
                of(emitChannel(guiAction({requestId, action, params}))),
                merge(
                    outcome$,
                    clock.delay$(timeoutMs).pipe(map(() => {
                        throw new Error(`GUI request '${action}' timed out`)
                    }))
                ).pipe(
                    take(1),
                    finalize(() => pending.delete(requestId))
                )
            )
        })
    }

    function respond({requestId, clientId, subscriptionId, success, data, error}) {
        const entry = pending.get(requestId)
        const incomingSubscriptionKey = keyOf({clientId, subscriptionId})
        const pendingFound = Boolean(entry)
        const matched = pendingFound && entry.subscriptionKey === incomingSubscriptionKey
        publishResponseRouting({
            requestId,
            action: entry?.action,
            owningSubscriptionKey: entry?.subscriptionKey,
            incomingSubscriptionKey,
            pendingFound,
            matched
        })
        if (matched) {
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

    // Metadata only — no request/response payloads at debug level.
    function publishRequestSent({requestId, action, subscriptionKey}) {
        bus.publish({
            type: 'gui.request',
            level: 'debug',
            message: `GUI request ${action} (${requestId}) -> ${subscriptionKey}`,
            requestId,
            action,
            subscriptionKey
        })
    }

    function publishResponseRouting({requestId, action, owningSubscriptionKey, incomingSubscriptionKey, pendingFound, matched}) {
        bus.publish({
            type: 'gui.response',
            level: 'debug',
            message: `GUI response ${requestId} action=${action} pendingFound=${pendingFound} matched=${matched} owner=${owningSubscriptionKey} incoming=${incomingSubscriptionKey}`,
            requestId,
            action,
            owningSubscriptionKey,
            incomingSubscriptionKey,
            pendingFound,
            matched
        })
    }
}

function keyOf({clientId, subscriptionId}) {
    return `${clientId}:${subscriptionId}`
}

module.exports = {createGuiRequests}
