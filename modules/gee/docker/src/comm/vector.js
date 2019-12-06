const {Subject} = require('rxjs')
const {serializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const log = require('../log')

const vector = ({name, port, in$ = new Subject(), out$ = new Subject()}) => {
    const vectorId = uuid()

    const msg = msg => [
        `Vector [${name}.${vectorId.substr(-4)}]`,
        msg
    ].join(' ')

    const handleValue = value => {
        log.trace(msg('value:'), value)
        out$.next(value)
    }
    
    const handleError = error => {
        log.trace(msg('error:'), error)
        out$.error(error)
    }
    
    const handleComplete = () => {
        log.trace(msg('complete'))
        out$.complete()
    }
    
    const handleMessage = message => {
        message.value && handleValue(message.value)
        message.error && handleError(message.error)
        message.complete && handleComplete()
    }
    
    port.on('message', handleMessage)

    const send = message =>
        port.postMessage(message)

    const next = value =>
        send({value})

    const error = error =>
        send({error: serializeError(error)})

    const complete = () =>
        send({complete: true})

    in$.subscribe({next, error, complete})

    return {name, vectorId, in$, out$}
}

module.exports = vector
