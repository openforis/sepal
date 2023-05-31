const {Subject, takeUntil, firstValueFrom, finalize, first, tap} = require('rxjs')
const log = require('#sepal/log').getLogger('http')
const {toException, errorReport} = require('#sepal/exception')

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
    operationId
}) => ({
    defaultMessage,
    messageKey,
    messageArgs,
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

const renderStream = async (ctx, body$) => {
    try {
        handleSuccess(ctx, await firstValueFrom(body$, {defaultValue: undefined}))
    } catch (error) {
        handleError(ctx, error)
    }
}

const handleHttp = async ctx => {
    const close$ = new Subject()
    const close = () => close$.next()
    ctx.req.on('close', close)
    ctx.req.socket.on('close', close)
    const body$ = ctx.result$.pipe(
        takeUntil(
            close$.pipe(
                first(),
                tap(() => log.isDebug() && log.debug(`${ctx.requestTag} ${ctx.method} ${ctx.url} - cancelled`))
            )
        ),
        finalize(() => {
            close$.complete()
            ctx.req.removeListener('close', close)
            ctx.req.socket.removeListener('close', close)
        })
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
        ctx.args$.next(message.toString())
    )

    ctx.result$.pipe(
        takeUntil(close$)
    ).subscribe({
        next: value => ws.send(value),
        error: error => {
            const exception = toException(error)
            if (exception.statusCode < 500) {
                log.warn(exception.message)
            } else {
                log.error(errorReport(exception))
            }
            ws.terminate()
        },
        complete: () => {
            ws.terminate()
        }
    })
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

module.exports = {resolveStream, stream}
