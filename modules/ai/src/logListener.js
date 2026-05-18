// log4js adapter for the event bus. Routes each bus event to a
// log4js category derived from the event's type prefix.

const {getLogger} = require('#sepal/log')

// Un-prefixed event types that should still bucket to a named category.
const UNPREFIXED_CATEGORY = {
    wsIn: 'ws',
    wsOut: 'ws',
    wsConnectionError: 'ws',
    wsRouteError: 'ws',
    workFailed: 'ws'
}

const FALLBACK_CATEGORY = 'ai'

function subscribeLogListener({bus}) {
    const loggerFor = memoizedLoggerFor(getLogger)
    bus.events$.subscribe({
        next: event => {
            try {
                onEvent(loggerFor, event)
            } catch (error) {
                loggerFor(FALLBACK_CATEGORY).error('Log listener threw while handling event:', error)
            }
        },
        error: error => fatal('Event bus errored', error),
        complete: () => fatal('Event bus completed unexpectedly')
    })
}

function onEvent(loggerFor, event) {
    if (event.level && event.message) {
        loggerFor(categoryOf(event))[event.level](event.message)
    }
}

function categoryOf({type}) {
    if (!type) return FALLBACK_CATEGORY
    if (UNPREFIXED_CATEGORY[type]) return UNPREFIXED_CATEGORY[type]
    // Dotted types route by their first segment — this naturally handles span
    // events (kind.subkind.started → kind) and domain events alike. Un-prefixed
    // types not in the explicit map are unclassified by convention and surface in
    // the fallback logger rather than silently creating an undeclared category.
    // Adding a new dotted subsystem is a config-side change in log.json, not a
    // routing decision here.
    const dot = type.indexOf('.')
    if (dot < 0) return FALLBACK_CATEGORY
    return type.slice(0, dot)
}

function memoizedLoggerFor(resolve) {
    const cache = new Map()
    return category => {
        if (!cache.has(category)) cache.set(category, resolve(category))
        return cache.get(category)
    }
}

function fatal(reason, error) {
    const log = getLogger(FALLBACK_CATEGORY)
    log.error(`FATAL: ${reason}`, error)
    // eslint-disable-next-line no-console
    console.error(`FATAL: ${reason}`, error)
    process.exit(1)
}

module.exports = {subscribeLogListener, onEvent, categoryOf}
