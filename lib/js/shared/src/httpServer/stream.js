const {Subject} = require('rxjs')
const {first, takeUntil} = require('rxjs/operators')
const log = require('sepal/log').getLogger()

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
            defaultMessage: error.defaultMessage,
            messageKey: error.messageKey,
            messageArgs: error.messageArgs
        }
        : 'other error'
}

const handleSuccess = (ctx, value) =>
    ctx.body = value

const renderStream = async (ctx, body$) => {
    try {
        handleSuccess(ctx, await body$.toPromise())
    } catch (error) {
        handleError(ctx, error)
    }
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
    ).subscribe({
        next: value => ws.send(value),
        error: error => ws.error(error)
    })
}

const stream = result$ =>
    ctx => {
        ctx.args$ = new Subject()
        ctx.result$ = result$(ctx)
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
