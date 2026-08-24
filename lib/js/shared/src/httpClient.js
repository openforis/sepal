import base64 from 'base-64'
import {defer, from, map, NEVER, raceWith, switchMap, tap, throwError, timer} from 'rxjs'
import {fromFetch} from 'rxjs/fetch'
import ShortUniqueId from 'short-unique-id'

import {getLogger} from '#sepal/log'

import {autoRetry} from './rxjs.js'
import {applyDefaults} from './util.js'

const log = getLogger('http/client')
const uid = new ShortUniqueId()

const DEFAULT_RETRY_CONFIG = {
    maxRetries: 5,
    minRetryDelay: 500,
    maxRetryDelay: 2000,
    retryDelayFactor: 2,
    skip: error => error.statusCode && error.statusCode < 500
}

// `json` is read as text and parsed further down the pipe, after the retry operator:
// a malformed response is deterministic, so retrying it only wastes requests.
const RESPONSE_READERS = {
    text: response => response.text(),
    json: response => response.text(),
    arrayBuffer: response => response.arrayBuffer(),
    blob: response => response.blob()
}

const responseReader = responseType => {
    const reader = RESPONSE_READERS[responseType]
    if (!reader) {
        throw new Error(`Unsupported responseType: ${responseType}, expected one of ${Object.keys(RESPONSE_READERS).join(', ')}`)
    }
    return reader
}

// An empty body is a valid empty result rather than a parse failure, so that
// endpoints answering with an empty 200 don't have to be special-cased by callers.
const parseJson = (body, {requestId, method, url, statusCode, request}) => {
    if (body.trim() === '') {
        return undefined
    }
    try {
        return JSON.parse(body)
    } catch (cause) {
        const error = new Error(`<${requestId}> ${method} ${url} - ${statusCode}, invalid JSON response (${cause.message})`)
        error.request = request
        error.body = body
        error.statusCode = statusCode
        throw error
    }
}

const bodyLength = body =>
    body?.byteLength ?? body?.size ?? body?.length ?? 0

const queryString = query =>
    Object.entries(query).map(
        ([parameter, value]) => ([
            encodeURIComponent(parameter),
            encodeURIComponent(typeof value === 'object' ? JSON.stringify(value) : value)
        ].join('='))
    ).join('&')

const get$ = (url, options) =>
    execute$(url, 'GET', options)

const post$ = (url, {headers, body, retry, ...options} = {}) =>
    execute$(url, 'POST', {
        ...options,
        body: body && queryString(body),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            ...headers
        },
        retry
    })

const postJson$ = (url, {headers, body, retry, ...options} = {}) =>
    execute$(url, 'POST', {
        ...options,
        body: body && JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...headers
        },
        retry
    })

const postBinary$ = (url, {headers, retry, ...options} = {}) =>
    execute$(url, 'POST', {
        ...options,
        headers: {
            'Content-Type': 'application/octet-stream',
            ...headers
        },
        retry
    })

const delete$ = (url, {retry, ...options} = {}) =>
    execute$(url, 'DELETE', {
        ...options,
        retry
    })

const execute$ = (url, method, {
    query,
    body,
    username,
    password,
    headers,
    redirect,
    responseType = 'text',
    validStatuses = [],
    timeout = 600000,
    retry
} = {}) => {
    
    const urlWithQuery = query
        ? `${url}?${queryString(query)}`
        : url

    if (username || password) {
        headers = {
            'Authorization': `Basic ${base64.encode(`${username}:${password}`)}`,
            ...headers
        }
    }

    const options = {
        method,
        headers,
        body,
        redirect
    }

    const timeout$ = () =>
        timer(timeout).pipe(
            switchMap(() =>
                throwError(() => new Error(`Timeout exceeded (${timeout}ms)`))
            )
        )

    const fetch$ = () =>
        defer(() =>
            fromFetch(new Request(urlWithQuery, options)).pipe(
                raceWith(timeout ? timeout$() : NEVER)
            )
        )

    return defer(() => {
        const read = responseReader(responseType)
        const t0 = Date.now()
        const requestId = uid.rnd()
        log.debug(`<${requestId}> ${method} ${url} - started`)
        return fetch$().pipe(
            switchMap(response => {
                const success = response.status < 400 || validStatuses.includes(response.status)
                return from(success ? read(response) : response.text()).pipe(
                    map(body => {
                        if (success) {
                            return {
                                statusCode: response.status,
                                headers: response.headers,
                                body
                            }
                        } else {
                            const error = new Error(`<${requestId}> ${method} ${url} - ${response.status} ${response.statusText} (${Date.now() - t0}ms)`)
                            error.request = options
                            error.body = body
                            error.statusCode = response.status
                            throw error
                        }
                    })
                )
            }),
            autoRetry(
                applyDefaults(DEFAULT_RETRY_CONFIG, {
                    ...retry,
                    onRetryError: (error, retryError) => {
                        log.debug(`${error.message} - ${retryError}`)
                        error.message = `${error.message} - ${retryError}`
                        throw error
                    }
                })
            ),
            tap(({statusCode, body}) =>
                log.debug(`<${requestId}> ${method} ${url} - ${statusCode}, ${Date.now() - t0}ms → ${bodyLength(body)}b`)
            ),
            map(result => responseType === 'json'
                ? {...result, body: parseJson(result.body, {requestId, method, url, statusCode: result.statusCode, request: options})}
                : result
            )
        )
    })
}

export {delete$, get$, post$, postBinary$, postJson$}
