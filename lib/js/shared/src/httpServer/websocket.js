const log = require('#sepal/log').getLogger('http/server')
const {toException, errorReport} = require('#sepal/exception')

const websocket = (ws, in$, out$) => {
    ws.on('message', data => {
        try {
            const msg = JSON.parse(data.toString())
            log.debug('WebSocket message', msg)
            in$.next(msg)
        } catch (error) {
            log.error('WebSocket message parsing error', error)
        }
    })

    ws.on('error', error => {
        log.error('WebSocket error', error)
        close()
    })

    ws.on('close', () => {
        log.debug('WebSocket closed')
        close()
    })

    const onMessage = msg => {
        const data = JSON.stringify(msg)
        ws.send(data)
    }

    const onError = error => {
        const exception = toException(error)
        if (exception.statusCode < 500) {
            log.warn(exception.message)
        } else {
            log.error(errorReport(exception))
        }
        close()
    }

    const onComplete = () => {
        close()
    }
    
    const out = out$.subscribe({
        next: msg => onMessage(msg),
        error: error => onError(error),
        complete: () => onComplete()
    })

    const close = () => {
        in$.complete()
        out.unsubscribe()
        ws.terminate()
    }
}

module.exports = {websocket}
