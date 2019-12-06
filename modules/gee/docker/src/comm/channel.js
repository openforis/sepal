const {Subject} = require('rxjs')
const {share, filter, finalize, takeUntil} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const log = require('../log')

const channel = (transport, channelId = uuid(), in$ = new Subject(), out$ = new Subject()) => {
    const {id: transportId, in$: transportIn$, out$: transportOut$} = transport
    const cancel$ = new Subject()
    
    const msg = (message, direction) => [
        `Channel [${transportId}.${channelId}${direction ? `.${direction}` : ''}]`,
        message
    ].join(' ')

    const handleIn = () => {
        const inMsg = message => msg(message, 'in')

        const inValue = value => {
            log.debug(inMsg('value:'), value)
            transportIn$.next({channelId, value})
        }
    
        const inError = error => {
            log.debug(inMsg('error:'), error)
            transportIn$.next({channelId, error})
        }
    
        const inComplete = () => {
            log.debug(inMsg('complete'))
            transportIn$.next({channelId, complete: true})
        }
    
        in$.pipe(
            takeUntil(cancel$)
        ).subscribe({
            next: value => inValue(value),
            error: error => inError(error),
            complete: () => inComplete()
        })
    }
    
    const handleOut = () => {
        const outMsg = message => msg(message, 'out')

        const outValue = value => {
            log.debug(outMsg('value:'), value)
            out$.next(value)
        }
    
        const outError = error => {
            log.debug(outMsg('error:'), error)
            out$.error(error)
        }
    
        const outComplete = () => {
            log.debug(outMsg('complete'))
            out$.complete()
        }
    
        transportOut$.pipe(
            share(),
            filter(({channelId: currentChannelId}) => currentChannelId === channelId),
        ).subscribe({
            next: message => {
                message.value && outValue(message.value)
                message.error && outError(message.error)
                message.complete && outComplete()
                message.finalize && cancel$.next()
            }
        })
    }

    handleIn()
    handleOut()

    log.debug(msg('created'))
    
    return {
        transportId,
        channelId,
        in$,
        out$: out$.pipe(
            finalize(() => transportIn$.next({channelId, finalize: true}))
        )
    }
}

module.exports = channel
