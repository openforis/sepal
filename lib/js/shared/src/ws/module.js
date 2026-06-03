const {Subject, EMPTY, catchError, defer, finalize, ignoreElements, merge, startWith, switchMap, tap} = require('rxjs')
const log = require('#sepal/log').getLogger('ws')

// Shared per-connection WebSocket scaffolding for modules speaking the gateway's
// subscription protocol. `protocol` is invoked once per connection with {send, stop$} —
// `send` emits an outbound message, `stop$` is a read-only observable that fires on
// teardown — sets up its module state (wiring any cleanup to stop$), and returns a
// message handler, either directly or as a promise. The underlying subjects are created
// per connection, never shared between clients.
const moduleWs$ = protocol =>
    in$ => {
        const out$ = new Subject()
        const stop$ = new Subject()

        const send = message =>
            out$.next(message)

        const handleIncomingMessage = ({hb, ...message}, handler) => {
            if (hb) {
                // echo heartbeat
                send({hb})
            } else {
                handler(message)
            }
        }

        // Inbound messages drive the handler (side effects only, no client output);
        // a thrown handler error is logged and stops processing without dropping the
        // connection, matching the outbound stream's independence.
        const inbound$ = handler =>
            in$.pipe(
                tap(message => handleIncomingMessage(message, handler)),
                ignoreElements(),
                catchError(error => {
                    log.error('Connection error (unexpected)', error)
                    return EMPTY
                })
            )

        const outbound$ = () =>
            out$.pipe(
                startWith({ready: true})
            )

        // Merge inbound processing with the outbound stream so both share the
        // connection's lifecycle. Gating behind the resolved protocol means
        // {ready: true} is emitted — and messages are processed — only once the
        // handler is attached, so nothing races ahead of (possibly async) setup.
        // defer + Promise.resolve invokes protocol lazily on subscribe and accepts a
        // handler returned directly or as a promise, so a setup failure (thrown or
        // rejected) surfaces as a connection error rather than an uncaught exception.
        return defer(() => Promise.resolve(protocol({send, stop$: stop$.asObservable()}))).pipe(
            tap({
                subscribe: () => log.info('Connected')
            }),
            switchMap(handler => merge(inbound$(handler), outbound$())),
            finalize(() => {
                stop$.next()
                log.info('Disconnected')
            })
        )
    }

module.exports = {moduleWs$}
