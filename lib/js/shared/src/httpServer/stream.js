const {Subject, firstValueFrom, finalize} = require('rxjs')
const log = require('#sepal/log').getLogger('http')
const {toException, errorReport} = require('#sepal/exception')
const {websocket} = require('./websocket')

/**
 * Format exception for GUI use
 * @param {exception} instance of Exceptioon
 */
const formatException = ({
    userMessage: {
        message: defaultMessage,
        key: messageKey,
        args: messageArgs
    },
    errorCode,
    statusCode,
    operationId
}) => ({
    defaultMessage,
    messageKey,
    messageArgs,
    errorCode,
    statusCode,
    operationId
})

const handleError = (ctx, error) => {
    const exception = toException(error)
    if (exception.statusCode < 500) {
        log.warn(error.message)
    } else {
        log.error(errorReport(exception))
    }
    ctx.status = exception.statusCode
    ctx.body = formatException(exception)
}

const handleSuccess = (ctx, value) =>
    ctx.body = value

const renderStream = async (ctx, body$) => {
    try {
        handleSuccess(ctx, await firstValueFrom(body$, {defaultValue: undefined}))
    } catch (error) {
        handleError(ctx, error)
    }
}

const handleHttp = async ctx => {
    const close = () => {
        ctx.result$.complete()
        ctx.cancelled = true
    }
    ctx.req.on('close', close)
    ctx.req.socket.on('close', close)
    const body$ = ctx.result$.pipe(
        finalize(() => {
            ctx.req.removeListener('close', close)
            ctx.req.socket.removeListener('close', close)
        })
    )
    await renderStream(ctx, body$)
}

const handleWebsocket = async ctx => {
    const ws = await ctx.ws()
    websocket(ws, ctx.args$, ctx.result$)
}

const stream = result$ =>
    ctx => {
        ctx.args$ = new Subject()
        ctx.result$ = result$(ctx)
    }

const resolveStream = () =>
    async (ctx, next) => {
        try {
            await next()
            if (ctx.result$) {
                ctx.ws
                    ? await handleWebsocket(ctx)
                    : await handleHttp(ctx)
            }
        } catch (error) {
            handleError(ctx, error)
        }
    }

const wsStream = handler$ =>
    ws => {
        const in$ = new Subject()
        const out$ = handler$({args$: in$})
        websocket(ws, in$, out$)
    }

module.exports = {resolveStream, stream, wsStream}
