const {Subject} = require('rxjs')
const {takeUntil} = require('rxjs/operators')
const log = require('./log')

const errorCodes = {
    'system': 500,
    'notfound': 404,
    'default': 400
}

const errorCode = type =>
    errorCodes[type] || 500

const handleSuccess = (ctx, value) =>
    ctx.body = value

const handleError = (ctx, error) => {
    log.error(error)
    ctx.status = errorCode(error.type)
    ctx.body = error.type
        ? {
            code: error.key,
            data: error.data,
            cause: error.cause
        }
        : 'other error'
}

const renderStream = async (ctx, body$) => {
    const result = await body$.toPromise()
    if (result) {
        result.value && handleSuccess(ctx, result.value)
        result.error && handleError(ctx, result.error)
    }
}

module.exports = async (ctx, next) => {
    const close$ = new Subject()
    ctx.req.on('close', () => close$.next())
    await next()
    if (ctx.stream$) {
        const body$ = ctx.stream$.pipe(
            takeUntil(close$)
        )
        await renderStream(ctx, body$)
    }
}
