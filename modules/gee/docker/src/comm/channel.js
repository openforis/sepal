const {Subject} = require('rxjs')
const {share, filter, finalize, takeUntil} = require('rxjs/operators')

const channel = (vector, channelId, in$ = new Subject(), out$ = new Subject()) => {
    const {in$: vectorIn$, out$: vectorOut$} = vector
    const cancel$ = new Subject()
    in$.pipe(
        takeUntil(cancel$)
    ).subscribe({
        next: value => vectorIn$.next({channelId, value}),
        error: error => vectorIn$.next({channelId, error}),
        complete: () => vectorIn$.next({channelId, complete: true})
    })
    vectorOut$.pipe(
        share(),
        filter(({channelId: currentChannelId}) => currentChannelId === channelId),
    ).subscribe({
        next: message => {
            message.value && out$.next(message.value)
            message.error && out$.error(message.error)
            message.complete && out$.complete()
            message.finalize && cancel$.next()
        }
    })
    return {
        in$,
        out$: out$.pipe(
            finalize(() => vectorIn$.next({channelId, finalize: true}))
        )
    }
}

module.exports = channel
