const {ReplaySubject} = require('rxjs')
const {finalize, takeUntil} = require('rxjs/operators')
const {serializeError, deserializeError} = require('serialize-error')
const log = require('sepal/log').getLogger('channel')

const channel = ({channelPort, channelId, conversationId, direction, in$ = new ReplaySubject(), out$ = new ReplaySubject()}) => {
    const stop$ = new ReplaySubject()
    
    const msg = (message, end) => [
        `Channel [${channelId}.${conversationId.substr(-4)}.${direction}${end ? `.${end}` : ''}]`,
        message
    ].join(' ')

    const handleIn$ = () => {
        const inMsg = message => msg(message, 'in')

        const next = value => {
            log.debug(inMsg('value: <omitted>'))
            log.trace(inMsg('value:'), value)
            channelPort.sendMessage('out', {value})
        }
    
        const error = error => {
            const serializedError = serializeError(error)
            log.debug(inMsg('error:'), serializedError)
            channelPort.sendMessage('out', {error: serializedError})
        }
    
        const complete = () => {
            log.debug(inMsg('complete'))
            channelPort.sendMessage('out', {complete: true})
        }
    
        const handleMessage = message => message.stop && stop()
        
        const removeMessageHandler = channelPort.addMessageHandler('in', handleMessage)

        const stop = () => {
            stop$.next()
            removeMessageHandler()
        }

        in$.pipe(
            takeUntil(stop$)
        ).subscribe({next, error, complete})

        return in$
    }
    
    const handleOut$ = () => {
        const outMsg = message => msg(message, 'out')

        const value = value => {
            log.debug(outMsg('value: <omitted>'))
            log.trace(outMsg('value:'), value)
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

        const handleMessage = message => {
            message.value && value(message.value)
            message.error && error(message.error)
            message.complete && complete()
        }

        const removeMessageHandler = channelPort.addMessageHandler('out', handleMessage)

        const stop = () => {
            removeMessageHandler()
        }

        return out$.pipe(
            takeUntil(stop$),
            finalize(() => {
                log.debug(outMsg('finalized'))
                channelPort.sendMessage('in', {stop: true})
            })
        )
    }

    log.debug(msg('created'))
    
    return {
        conversationId,
        in$: handleIn$(),
        out$: handleOut$()
    }
}

module.exports = channel
