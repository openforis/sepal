const {ReplaySubject, finalize, takeUntil} = require('rxjs')
const {serializeError, deserializeError} = require('serialize-error')
const {channelTag} = require('./tag')
const _ = require('lodash')

const loggers = {
    forward: require('#sepal/log').getLogger('channel-forward'),
    reverse: require('#sepal/log').getLogger('channel-reverse')
}

const channel = ({channelPort, transportId, conversationGroupId, conversationId, direction, linked, in$ = new ReplaySubject(1), out$ = new ReplaySubject(1)}) => {
    const stop$ = new ReplaySubject(1)
    const log = loggers[direction]

    const msg = (message, end) => [
        channelTag({transportId, conversationGroupId, conversationId, direction, end}),
        message
    ].join(' ')

    const handleIn$ = () => {
        const inMsg = message => msg(message, 'in')

        const next = value => {
            log.isTrace()
                ? log.trace(inMsg('value:'), value)
                : log.debug(() => inMsg('value: <omitted>'))
            
            channelPort.sendMessage('out', {next: true, value})
        }
    
        const error = error => {
            const serializedError = serializeError(error)
            log.debug(inMsg('error:'), serializedError)
            channelPort.sendMessage('out', {error: true, value: serializedError})
        }
    
        const complete = () => {
            log.debug(inMsg('complete'))
            channelPort.sendMessage('out', {complete: true})
        }
    
        in$.pipe(
            takeUntil(stop$),
            finalize(() => {
                log.debug(inMsg('finalized'))
                linked && stop$.next()
            })
        ).subscribe({next, error, complete})

        return in$
    }
    
    const handleOut$ = () => {
        const outMsg = message => msg(message, 'out')

        const value = value => {
            log.isTrace()
                ? log.trace(outMsg('value:'), value)
                : log.debug(() => outMsg('value: <omitted>'))
            out$.next(value)
        }
    
        const error = serializedError => {
            log.debug(outMsg('error:'), serializedError)
            out$.error(deserializeError(serializedError))
        }
    
        const complete = () => {
            log.debug(outMsg('complete'))
            out$.complete()
        }

        const handleMessage = message => {
            message.next && value(message.value)
            message.error && error(message.value)
            message.complete && complete()
        }

        const removeMessageHandler = channelPort.addMessageHandler(handleMessage)

        return out$.pipe(
            takeUntil(stop$),
            finalize(() => {
                log.debug(outMsg('finalized'))
                removeMessageHandler()
                linked && stop$.next()
            })
        )
    }

    log.debug(msg('created'))
    
    return {
        conversationGroupId,
        conversationId,
        in$: handleIn$(),
        out$: handleOut$()
    }
}

module.exports = {channel}
