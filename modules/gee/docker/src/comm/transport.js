const {Subject} = require('rxjs')
const {serializeError} = require('serialize-error')
const {v4: uuid} = require('uuid')
const channel = require('./channel')
const log = require('../log')

const transport = ({id = uuid(), port, in$ = new Subject(), out$ = new Subject(), onChannel}) => {
    const send = message =>
        port.postMessage(message)

    const createChannel = channelId => {
        log.trace(msg('create channel:'), channelId)
        send({createChannel: channelId})
        return channel(transportInstance, channelId)
    }

    const transportInstance = {id, in$, out$, createChannel}

    const msg = msg => [
        `Transport [${id}]`,
        msg
    ].join(' ')

    const handleOut = () => {
        const outValue = value => {
            log.trace(msg('value:'), value)
            out$.next(value)
        }
        
        const outError = error => {
            log.trace(msg('error:'), error)
            out$.error(error)
        }
        
        const outComplete = () => {
            log.trace(msg('complete'))
            out$.complete()
        }
    
        const createChannel = channelId => {
            log.trace(msg('create channel:'), channelId)
            onChannel && onChannel(channel(transportInstance, channelId))
        }
        
        const outMessage = message => {
            message.value && outValue(message.value)
            message.error && outError(message.error)
            message.complete && outComplete()
            message.createChannel && createChannel(message.createChannel)
        }
    
        port.on('message', outMessage)
    }

    const handleIn = () => {
        const next = value =>
            send({value})

        const error = error =>
            send({error: serializeError(error)})

        const complete = () =>
            send({complete: true})

        in$.subscribe({next, error, complete})
    }

    handleIn()
    handleOut()

    return transportInstance
}

module.exports = transport
