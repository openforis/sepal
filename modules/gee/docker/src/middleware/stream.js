const {Subject} = require('rxjs')
const {takeUntil} = require('rxjs/operators')

module.exports = async (ctx, next) => {
    const close$ = new Subject()
    ctx.req.on('close', () => {
        close$.next()
    })
    await next()
    if (ctx.stream$) {
        const body$ = ctx.stream$.pipe(
            takeUntil(close$)
        )
        ctx.body = await body$.toPromise()
    }
}
