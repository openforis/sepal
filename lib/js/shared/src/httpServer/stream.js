import {EMPTY, firstValueFrom, fromEvent, of, Subject, switchMap, take, takeUntil, tap, toArray} from 'rxjs'

import {errorReport, toException} from '#sepal/exception'
import {getLogger} from '#sepal/log'

import {websocket} from './websocket.js'

const log = getLogger('http/server')

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
    errorType,
    errorCode,
    statusCode,
    operationId
}) => ({
    defaultMessage,
    messageKey,
    messageArgs,
    errorType,
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
                    throw new Error(`Invalid number of values: ${array.length}`)
            }
        })
    )

const handleHttp = async ctx => {
    // ServerResponse.close is scoped to this response; request and socket lifecycle events are not.
    const responseClosed$ = fromEvent(ctx.res, 'close').pipe(
        take(1),
        tap(() => {
            ctx.cancelled = true
        })
    )
    // Cancel outside cardinality buffering so an abandoned partial result is discarded.
    const body$ = allowZeroOrOneValues(ctx.result$).pipe(
        takeUntil(responseClosed$)
    )
    try {
        const value = await firstValueFrom(body$, {defaultValue: undefined})
        // Do not assign a body after the response has closed.
        if (!ctx.cancelled) {
            handleSuccess(ctx, value)
        }
    } catch (error) {
        handleError(ctx, error)
    }
}

const handleWebsocket = async ctx => {
    const ws = await ctx.ws()
    websocket(ws, ctx.arg$, ctx.result$)
}

const stream = result$ =>
    ctx => {
        ctx.arg$ = new Subject()
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
        const out$ = handler$({arg$: in$})
        websocket(ws, in$, out$)
    }

export {formatException, resolveStream, stream, wsStream}
