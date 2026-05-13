const {defer, tap, catchError, throwError} = require('rxjs')

function createTracer({bus, clock, createId}) {
    return {span, span$}

    async function span(name, attrs, work) {
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

    function span$(name, attrs, work$) {
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
        publish(`${name}.started`, 'debug', formatStart(name, attrs, correlationId), {at: startedAt})
        return {complete, fail}

        function complete() {
            const endedAt = clock.now()
            const durationMs = endedAt - startedAt
            publish(`${name}.completed`, 'info', formatComplete(name, attrs, correlationId, durationMs), {at: endedAt, durationMs})
        }

        function fail(error) {
            const endedAt = clock.now()
            const durationMs = endedAt - startedAt
            publish(`${name}.failed`, 'error', formatFailed(name, attrs, correlationId, durationMs, error.message), {at: endedAt, durationMs, error: error.message})
        }

        function publish(type, level, message, phaseAttrs) {
            bus.publish({type, name, correlationId, level, message, ...attrs, ...phaseAttrs})
        }
    }
}

function formatStart(name, attrs, correlationId) {
    return `${name} started ${formatAttrs(attrs)}(${correlationId})`
}

function formatComplete(name, attrs, correlationId, durationMs) {
    return `${name} completed ${formatAttrs(attrs)}(${correlationId}) in ${durationMs}ms`
}

function formatFailed(name, attrs, correlationId, durationMs, error) {
    return `${name} failed ${formatAttrs(attrs)}(${correlationId}) in ${durationMs}ms: ${error}`
}

function formatAttrs(attrs) {
    const entries = Object.entries(attrs)
    if (entries.length === 0) return ''
    return entries.map(([k, v]) => `${k}=${v}`).join(' ') + ' '
}

module.exports = {createTracer}
