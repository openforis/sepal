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
        try {
            ctx.body = await body$.toPromise()
        } catch (error) {
            console.error(error.message)
            ctx.body = error.message
            ctx.status = 500
        }
    }
}
