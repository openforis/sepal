const {Subject} = require('rxjs')
const {takeUntil} = require('rxjs/operators')

const errorCodes = {
    'system': 500,
    'notfound': 404,
    'default': 400
}

const errorCode = type =>
    errorCodes[type] || 500

const renderStream = async (ctx, body$) => {
    try {
        ctx.body = await body$.toPromise()
    } catch (error) {
        ctx.status = errorCode(error.type)
        ctx.body = error.type
            ? {
                code: error.key,
                data: error.data,
                cause: error.cause
            }
            : 'other error'
    }
}

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
        await renderStream(ctx, body$)
    }
}
