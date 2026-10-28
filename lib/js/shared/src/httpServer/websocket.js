import {errorReport, toException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

const log = getLogger('http/server')

const websocket = (ws, in$, out$) => {
    // out$ may complete or fail while subscribing, before out is assigned.
    let out
    const close = () => {
        in$.complete()
        out?.unsubscribe()
        ws.terminate()
    }

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

    out = out$.subscribe({
        next: msg => onMessage(msg),
        error: error => onError(error),
        complete: () => onComplete()
    })
}

export {websocket}
