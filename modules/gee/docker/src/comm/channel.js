const {ReplaySubject} = require('rxjs')
const {finalize, takeUntil} = require('rxjs/operators')
const {serializeError, deserializeError} = require('serialize-error')
const log = require('../log')('channel')

const channel = ({transport, channelId, conversationId, direction, in$ = new ReplaySubject(), out$ = new ReplaySubject()}) => {
    const {id: transportId, port} = transport
    const stop$ = new ReplaySubject()
    
    const msg = (message, direction) => [
        `Channel [${transportId}.${channelId}.${conversationId.substr(-4)}${direction ? `.${direction}` : ''}]`,
        message
    ].join(' ')

    const postMessage = message => {
        port.postMessage({channelId, conversationId, message})
    }
    
    const handleReceivedMessage = handler =>
        ({channelId: messageChannelId, conversationId: messageConversationId, message}) =>
            messageChannelId === channelId && messageConversationId === conversationId && handler(message)

    const handleIn$ = () => {
        const inMsg = message => msg(message, 'in')

        const next = value => {
            log.debug(inMsg('value:'), value)
            postMessage({value})
        }
    
        const error = error => {
            const serializedError = serializeError(error)
            log.debug(inMsg('error:'), serializedError)
            postMessage({error: serializedError})
        }
    
        const complete = () => {
            log.debug(inMsg('complete'))
            postMessage({complete: true})
        }
    
        const handleMessage = handleReceivedMessage(
            message => {
                message.stop && stop()
            }
        )
        
        const stop = () => {
            stop$.next()
            port.off('message', handleMessage)
            log.trace(inMsg(`removed <${direction}> listener`))
        }

        port.on('message', handleMessage)
        log.trace(inMsg(`added <${direction}> listener`))

        in$.pipe(
            takeUntil(stop$)
        ).subscribe({next, error, complete})

        return in$
    }
    
    const handleOut$ = () => {
        const outMsg = message => msg(message, 'out')

        const value = value => {
            log.debug(outMsg('value:'), value)
            out$.next(value)
        }
    
        const error = serializedError => {
            log.debug(outMsg('error:'), serializedError)
            out$.error(deserializeError(serializedError))
            stop()
        }
    
        const complete = () => {
            log.debug(outMsg('complete'))
            out$.complete()
            stop()
        }

        const handleMessage = handleReceivedMessage(
            message => {
                message.value && value(message.value)
                message.error && error(message.error)
                message.complete && complete()
            }
        )

        const stop = () => {
            port.off('message', handleMessage)
            log.trace(outMsg(`removed <${direction}> listener`))
        }

        port.on('message', handleMessage)
        log.trace(outMsg(`added <${direction}> listener`))

        return out$.pipe(
            takeUntil(stop$),
            finalize(() => {
                log.debug(outMsg('finalized'))
                postMessage({stop: true})
            })
        )
    }

    log.debug(msg('created'))
    
    return {
        transportId,
        channelId,
        conversationId,
        in$: handleIn$(),
        out$: handleOut$()
    }
}

module.exports = channel
