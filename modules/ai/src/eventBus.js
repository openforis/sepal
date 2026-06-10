import {catchError, defer, Subject, tap, throwError} from 'rxjs'

function createEventBus({clock, createId} = {}) {
    const subject = new Subject()

    return {publish, track, track$, events$: subject.asObservable()}

    function publish(event) {
        subject.next(event)
    }

    async function track(name, attrs, work) {
        const ctx = beginSpan(name, attrs)
        try {
            const result = await work()
            ctx.complete()
            return result
        } catch (error) {
            ctx.fail(error)
            throw error
        }
    }

    function track$(name, attrs, work$) {
        return defer(() => {
            const ctx = beginSpan(name, attrs)
            return work$.pipe(
                tap({complete: () => ctx.complete()}),
                catchError(error => {
                    ctx.fail(error)
                    return throwError(() => error)
                })
            )
        })
    }

    function beginSpan(name, attrs) {
        const correlationId = createId()
        const startedAt = clock.now()
        publishSpan(`${name}.started`, 'debug', formatStart(name, attrs, correlationId), {at: startedAt})
        return {complete, fail}

        function complete() {
            const endedAt = clock.now()
            const durationMs = endedAt - startedAt
            publishSpan(`${name}.completed`, 'info', formatComplete(name, attrs, correlationId, durationMs), {at: endedAt, durationMs})
        }

        function fail(error) {
            const endedAt = clock.now()
            const durationMs = endedAt - startedAt
            publishSpan(`${name}.failed`, 'error', formatFailed(name, attrs, correlationId, durationMs, error.message), {at: endedAt, durationMs, error: error.message})
        }

        function publishSpan(type, level, message, phaseAttrs) {
            publish({type, name, correlationId, level, message, ...attrs, ...phaseAttrs})
        }
    }
}

function formatStart(name, attrs, correlationId) {
    return `${name} started ${formatAttrs(attrs)}spanId=${correlationId}`
}

function formatComplete(name, attrs, correlationId, durationMs) {
    return `${name} completed ${formatAttrs(attrs)}spanId=${correlationId} in ${durationMs}ms`
}

function formatFailed(name, attrs, correlationId, durationMs, error) {
    return `${name} failed ${formatAttrs(attrs)}spanId=${correlationId} in ${durationMs}ms: ${error}`
}

function formatAttrs(attrs) {
    const entries = Object.entries(attrs)
    if (entries.length === 0) return ''
    return entries.map(([k, v]) => `${k}=${v}`).join(' ') + ' '
}

export {createEventBus}
