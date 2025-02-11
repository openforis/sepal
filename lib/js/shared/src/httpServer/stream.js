const {Subject, firstValueFrom, of, toArray, switchMap, finalize, EMPTY} = require('rxjs')
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
    operationId
}) => ({
    defaultMessage,
    messageKey,
    messageArgs,
    errorCode,
    operationId
})

const handleError = (ctx, error) => {
    const exception = toException(error)
    if (exception.statusCode < 500) {
        log.warn(exception.message)
    } else {
        log.error(errorReport(exception))
    }
    ctx.status = exception.statusCode
    ctx.body = formatException(exception)
}

const handleSuccess = (ctx, value) =>
    ctx.body = value

const allowZeroOrOneValues = body$ =>
    body$.pipe(
        toArray(),
        switchMap(array => {
            switch (array.length) {
            case 0:
                return EMPTY
            case 1:
                return of(array[0])
            default:
                throw new Error('Invalid number of values:', array.length)
            }
        })
    )

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
    try {
        const value = await firstValueFrom(
            allowZeroOrOneValues(body$),
            {defaultValue: undefined}
        )
        handleSuccess(ctx, value)
    } catch (error) {
        handleError(ctx, error)
    }
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
        await next()
        if (ctx.result$) {
            ctx.ws
                ? await handleWebsocket(ctx)
                : await handleHttp(ctx)
        }
    }

const wsStream = handler$ =>
    ws => {
        const in$ = new Subject()
        const out$ = handler$({args$: in$})
        websocket(ws, in$, out$)
    }

module.exports = {resolveStream, stream, wsStream}
