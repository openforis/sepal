// One source-runtime operation at a time, owned before it is subscribed.
//
// Ownership is taken first because a runtime operation can settle inside subscribe(), and whatever reacts to that
// can start the next one. The replacement then owns the slot before the operation it replaces has finished
// subscribing, and the replaced one is released rather than kept. Only the current operation's terminal is
// delivered, and only once; a stream that errors or completes without one is reported UNAVAILABLE, so the owner
// always hears how it ended.

const TERMINAL = new Set(['READY', 'UNAVAILABLE', 'INVALID', 'COMPLETE'])

const unavailable = () => ({status: 'UNAVAILABLE', description: null, diagnostics: [], error: null})

export class TerminalOperation {
    #current = null

    start(state$, onTerminal) {
        this.stop()
        const operation = {settled: false, subscription: null}
        this.#current = operation
        const publish = terminal => {
            if (this.#current === operation && !operation.settled && TERMINAL.has(terminal?.status)) {
                operation.settled = true
                onTerminal(terminal)
            }
        }
        const failed = () => publish(unavailable())
        try {
            const subscription = state$.subscribe({next: publish, error: failed, complete: failed})
            if (this.#current === operation) {
                operation.subscription = subscription
            } else {
                subscription.unsubscribe()
            }
        } catch (_error) {
            failed()
        }
    }

    stop() {
        const operation = this.#current
        this.#current = null
        operation?.subscription?.unsubscribe()
    }
}
