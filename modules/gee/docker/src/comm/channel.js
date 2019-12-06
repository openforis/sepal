const {Subject} = require('rxjs')
const {serializeError} = require('serialize-error')

const channel = (port, in$ = new Subject()) => {
    const out$ = new Subject()

    const handleValue = value =>
        out$.next(value)
    
    const handleError = error =>
        out$.error(error)
    
    const handleComplete = () =>
        out$.complete()
    
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

    return {in$, out$}
}

module.exports = channel
