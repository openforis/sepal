const {Subject} = require('rxjs')
const {share, filter} = require('rxjs/operators')

const subchannel = ({in$, out$}, channelId, subIn$ = new Subject(), subOut$ = new Subject()) => {
    subIn$.subscribe({
        next: value => in$.next({channelId, value}),
        error: error => in$.next({channelId, error}),
        complete: () => in$.next({channelId, complete: true})
    })
    out$.pipe(
        share(),
        filter(({channelId: currentChannelId}) => currentChannelId === channelId)
    ).subscribe({
        next: message => {
            message.value && subOut$.next(message.value)
            message.error && subOut$.error(message.error)
            message.complete && subOut$.complete()
        },
        // error: error => subOut$.next({channelId, error}),
        // complete: () => subOut$.next({channelId, complete: true})
    })
    return {in$: subIn$, out$: subOut$}
}

module.exports = subchannel
