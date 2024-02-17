const base64 = require('base-64')
const {Subject, of, throwError, catchError, map} = require('rxjs')
const request = require('request')
const _ = require('lodash')
const {autoRetry} = require('./rxjs')
const {applyDefaults} = require('./util')
const log = require('#sepal/log').getLogger('httpClient')

const DEFAULT_RETRY_CONFIG = {
    maxRetries: 5,
    minRetryDelay: 500,
    retryDelayFactor: 2,
    abort: error => error.statusCode < 500
}

const get$ = (url, {maxRetries, minRetryDelay, maxRetryDelay, retryDelayFactor, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'GET', {
        maxRetries,
        minRetryDelay,
        maxRetryDelay,
        retryDelayFactor,
        query,
        body,
        headers,
        validStatuses,
        ...args
    })

const post$ = (url, {maxRetries, minRetryDelay, maxRetryDelay, retryDelayFactor, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'POST', {
        maxRetries,
        minRetryDelay,
        maxRetryDelay,
        retryDelayFactor,
        query,
        body: toQueryString(body),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            ...headers
        },
        validStatuses,
        ...args
    })

const postJson$ = (url, {maxRetries, minRetryDelay, maxRetryDelay, retryDelayFactor, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'POST', {
        maxRetries,
        minRetryDelay,
        maxRetryDelay,
        retryDelayFactor,
        body: body && JSON.stringify(body),
        query,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...headers
        },
        validStatuses,
        ...args
    })

const postBinary$ = (url, {maxRetries, minRetryDelay, maxRetryDelay, retryDelayFactor, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'POST', {
        maxRetries,
        minRetryDelay,
        maxRetryDelay,
        retryDelayFactor,
        query,
        body,
        headers: {
            'Content-Type': 'application/octet-stream',
            ...headers
        },
        validStatuses,
        ...args
    })

const delete$ = (url, {maxRetries, minRetryDelay, maxRetryDelay, retryDelayFactor, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'DELETE', {
        maxRetries,
        minRetryDelay,
        maxRetryDelay,
        retryDelayFactor,
        headers,
        validStatuses,
        ...args
    })

const toQueryString = query =>
    query && Object.keys(query)
        .map(key => {
            const value = encodeURIComponent(
                typeof query[key] === 'object'
                    ? JSON.stringify(query[key])
                    : query[key]
            )
            return `${key}=${value}`
        })
        .join('&')

const validateResponse = (response, validStatuses) =>
    !validStatuses || validStatuses.includes(response.statusCode)
        ? response
        : throwError(() => response)

const execute$ = (url, method, {
    maxRetries,
    minRetryDelay,
    maxRetryDelay,
    retryDelayFactor,
    query,
    username,
    password,
    headers,
    validStatuses,
    ...args
}) => {
    const queryString = toQueryString(query)
    const urlWithQuery = queryString ? `${url}?${queryString}` : url
    if (username || password)
        headers = {
            'Authorization': `Basic ${base64.encode(`${username}:${password}`)}`,
            ...headers
        }
    const request$ = new Subject()
    const options = {url: urlWithQuery, method, headers, ...args}
    log.trace(() => `${method} ${url}`)
    const start = new Date()
    request(options, (error, response, body) => {
        const ms = new Date() - start
        const status = response ? response.statusCode : 503
        if (error) {
            request$.error(error)
        } else if(status === 503) {
            request$.error(
                new Error(`${method} ${url} 503 Failed to connect`)
            )
        } else if (status >= 400) {
            const e = new Error(`${method} ${url} - ${status} ${response.statusMessage}`)
            e.request = options
            e.body = body
            e.statusCode = status
            log.debug(`${method} ${url} - ${status} (${ms}ms)`)
            request$.error(e)
        } else {
            response.body = body
            request$.next(response)
            request$.complete()
            log.debug(() => `${method} ${url} - ${status} (${ms}ms)`)
        }
    })
    return request$.pipe(
        map(response => validateResponse(response, validStatuses)),
        catchError(e => {
            if (validStatuses && validStatuses.includes(e.statusCode)) {
                return of(e)
            } else {
                return throwError(() => e)
            }
        }),
        autoRetry(
            applyDefaults(DEFAULT_RETRY_CONFIG, {
                maxRetries,
                minRetryDelay,
                maxRetryDelay,
                retryDelayFactor
            })
        )
    )
}

module.exports = {get$, post$, postJson$, postBinary$, delete$}
