const log = require('#sepal/log').getLogger('ai')

function subscribeLogListener({bus}) {
    bus.events$.subscribe({
        next: event => {
            try {
                onEvent(log, event)
            } catch (error) {
                log.error('Log listener threw while handling event:', error)
            }
        },
        error: error => fatal('Event bus errored', error),
        complete: () => fatal('Event bus completed unexpectedly')
    })
}

function onEvent(log, event) {
    if (event.level && event.message) {
        log[event.level](event.message)
    }
}

function fatal(reason, error) {
    log.error(`FATAL: ${reason}`, error)
    // eslint-disable-next-line no-console
    console.error(`FATAL: ${reason}`, error)
    process.exit(1)
}

module.exports = {subscribeLogListener, onEvent}
