const {Subject} = require('rxjs')
const {first, takeUntil} = require('rxjs/operators')
const {deserializeError} = require('serialize-error')
const log = require('sepalLog')()

const errorCodes = {
    'system': 500,
    'notfound': 404,
    'default': 400
}

const errorCode = type =>
    errorCodes[type] || 500

const logError = error =>
    log.error(
        error.cause && error.cause.stack
            ? error.cause.stack
            : error
    )

const handleError = (ctx, error) => {
    logError(error)
    ctx.status = errorCode(error.type)
    ctx.body = error.type
        ? {
            code: error.key,
            data: error.data,
            cause: error.cause
        }
        : 'other error'
}

const handleSuccess = (ctx, value) =>
    ctx.body = value

const renderStream = async (ctx, body$) => {
    body$.subscribe(
        async result => handleSuccess(ctx, result),
        async error => handleError(ctx, error)
    )
}

const handleHttp = async ctx => {
    const close$ = new Subject()
    ctx.req.on('close', () => close$.next())
    const body$ = ctx.result$.pipe(
        first(),
        takeUntil(close$)
    )
    await renderStream(ctx, body$)
}

const handleWebsocket = async ctx => {
    const ws = await ctx.ws()
    const close$ = new Subject()

    ws.on('close', () => {
        close$.next()
        ws.terminate()
    })

    ws.on('message', message =>
        ctx.args$.next(message)
    )

    ctx.result$.pipe(
        takeUntil(close$)
    ).subscribe(
        result => {
            result.value && ws.send(result.value)
        },
        // [TODO] handle error
    )
}

const stream = func => {
    return ctx => {
        ctx.args$ = new Subject()
        ctx.result$ = func(ctx)
    }
}

const resolve = async (ctx, next) => {
    await next()
    if (ctx.result$) {
        ctx.ws
            ? await handleWebsocket(ctx)
            : await handleHttp(ctx)
    }
}

module.exports = {resolve, stream}
