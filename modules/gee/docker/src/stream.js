const {Subject} = require('rxjs')
const {first, takeUntil} = require('rxjs/operators')
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

const handleHttp = async ctx => {
    const close$ = new Subject()
    ctx.req.on('close', () => close$.next())
    const body$ = ctx.down$.pipe(
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
    ws.on('message', message => ctx.up$ && ctx.up$.next(message))
    ctx.down$.pipe(
        takeUntil(close$)
    ).subscribe(
        result => {
            result.value && ws.send(result.value)
            // result.error && ws.send(result.error)
        }
    )
}

const wrapper = func =>
    ctx => {
        ctx.down$ = func(ctx)
        ctx.up$ = null
    }

const resolve = async (ctx, next) => {
    await next()
    if (ctx.down$) {
        ctx.ws
            ? await handleWebsocket(ctx)
            : await handleHttp(ctx)
    }
}

module.exports = {wrapper, resolve}
