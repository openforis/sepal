const _ = require('lodash')
const {serializeError} = require('serialize-error')
// const log = require('@sepal/log')

const streamToPort = ({jobId, stream$, port, onMessage}) => {
    const send = msg => port.postMessage({jobId, ...msg})

    const next = value => {
        onMessage && onMessage({jobId, msg: `value: ${JSON.stringify(value)}`})
        send({value})
    }

    const error = error => {
        onMessage && onMessage({jobId, msg: `error: ${error}`})
        send({error: serializeError(error)})
    }

    const complete = () => {
        onMessage && onMessage({jobId, msg: 'complete'})
        send({complete: true})
    }

    stream$.subscribe({next, error, complete})
}

module.exports = {streamToPort}
