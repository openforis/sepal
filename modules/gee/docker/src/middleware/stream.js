const {Subject} = require('rxjs')
const {takeUntil} = require('rxjs/operators')

module.exports = async (ctx, next) => {
    const close$ = new Subject()
    ctx.req.on('close', () => {
        close$.next(1)
    })
    await next()
    if (ctx.stream$) {
        ctx.body = await ctx.stream$.pipe(
            takeUntil(close$)
        ).toPromise()
    }
}
