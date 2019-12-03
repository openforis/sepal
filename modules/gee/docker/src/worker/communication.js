const {Subject} = require('rxjs')
const {serializeError, deserializeError} = require('serialize-error')
// const log = require('@sepal/log')

const streamToPort = ({jobId, stream$, port, namespace, onMessage}) => {
    const send = msg => port.postMessage({jobId, [namespace]: msg})

    const next = value => {
        onMessage && onMessage({jobId, msg: `value: ${JSON.stringify(value)}`})
        send({value})
        // return port.postMessage({jobId, value})
    }

    const error = error => {
        onMessage && onMessage({jobId, msg: `error: ${error}`})
        send({error: serializeError(error)})
        // return port.postMessage({[namespace]: {jobId, error: serializeError(error)}})
    }

    const complete = () => {
        onMessage && onMessage({jobId, msg: 'complete'})
        send({complete: true})
        // return port.postMessage({jobId, complete: true})
    }

    stream$.subscribe({next, error, complete})
}

const portToStream = ({port, onMessage}) => {
    const stream$ = new Subject()

    const handleWorkerMessage = message => {
        message.value && handleValue(message)
        message.error && handleError(message)
        message.complete && handleComplete(message)
    }

    const handleValue = ({jobId, value}) => {
        onMessage && onMessage({jobId, msg: `value: ${value}`})
        stream$.next({jobId, value})
    }

    const handleError = ({jobId, error: serializedError}) => {
        const error = deserializeError(serializedError)
        const errors = _.compact([
            error.message,
            error.type ? `(${error.type})` : null
        ]).join()
        onMessage && onMessage({jobId, msg: `error: ${errors}`})
        stream$.next({jobId, error})
    }

    const handleComplete = ({jobId, complete}) => {
        onMessage && onMessage({jobId, msg: 'complete'})
        stream$.next({jobId, complete})
    }

    port.on('message', handleWorkerMessage)

    return stream$
}

module.exports = {streamToPort, portToStream}
