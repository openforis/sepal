const {Subject} = require('rxjs')
const {share, filter, finalize, takeUntil, tap, takeWhile} = require('rxjs/operators')
const {v4: uuid} = require('uuid')
const log = require('../log')

const channel = ({transport, channelId = uuid(), in$ = new Subject(), out$ = new Subject()}) => {
    const {id: transportId, in$: transportIn$, out$: transportOut$} = transport
    const stop$ = new Subject()
    
    const msg = (message, direction) => [
        `Channel [${transportId}.${channelId}${direction ? `.${direction}` : ''}]`,
        message
    ].join(' ')

    const transportIn = msg => {
        transportIn$.next({channelId, ...msg})
    }

    const handleIn = () => {
        const inMsg = message => msg(message, 'in')

        const next = value => {
            log.debug(inMsg('value:'), value)
            transportIn({value})
        }
    
        const error = error => {
            log.debug(inMsg('error:'), error)
            transportIn({error})
        }
    
        const complete = () => {
            log.debug(inMsg('complete'))
            transportIn({complete: true})
        }
    
        in$.pipe(
            takeUntil(stop$)
        ).subscribe({next, error, complete})
    }
    
    const handleOut = () => {
        const outMsg = message => msg(message, 'out')

        const value = value => {
            log.debug(outMsg('value:'), value)
            out$.next(value)
        }
    
        const error = error => {
            log.debug(outMsg('error:'), error)
            out$.error(error)
            stop()
        }
    
        const complete = () => {
            log.debug(outMsg('complete'))
            out$.complete()
            stop()
        }

        const stop = () => {
            stop$.next()
        }

        transportOut$.pipe(
            // tap(log.info),
            share(),
            filter(({channelId: currentChannelId}) => currentChannelId === channelId)
        ).pipe(
            takeUntil(stop$)
        ).subscribe({
            next: message => {
                message.value && value(message.value)
                message.error && error(message.error)
                message.complete && complete()
                message.finalize && stop()
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
            finalize(() => transportIn({finalize: true}))
        )
    }
}

module.exports = channel
