const {from, switchMap, defer, map} = require('rxjs')
const {fromFetch} = require('rxjs/fetch')
const base64 = require('base-64')
const {applyDefaults} = require('./util')
const {autoRetry} = require('./rxjs')
const log = require('#sepal/log').getLogger('httpClient')

const DEFAULT_RETRY_CONFIG = {
    maxRetries: 5,
    minRetryDelay: 500,
    maxRetryDelay: 2000,
    retryDelayFactor: 2,
    abort: error => error.statusCode && error.statusCode < 500
}

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

const delete$ = (url, {retry, ...options}) =>
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
    validStatuses = [],
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

    return defer(() => {
        const t0 = Date.now()
        return fromFetch(new Request(urlWithQuery, options)).pipe(
            switchMap(response =>
                from(response.text()).pipe(
                    map(body => {
                        if (response.status < 400 || validStatuses.includes(response.status)) {
                            return {
                                statusCode: response.status,
                                headers: response.headers,
                                body
                            }
                        } else {
                            const error = new Error(`${method} ${url} - ${response.status} ${response.statusText} (${Date.now() - t0}ms)`)
                            error.request = options
                            error.body = body
                            error.statusCode = response.status
                            log.debug(error)
                            throw error
                        }
                    })
                )
            ),
            autoRetry(
                applyDefaults(DEFAULT_RETRY_CONFIG, {
                    initialTimestamp: t0,
                    ...retry,
                })
            ),
        )
    })
}

module.exports = {get$, post$, postJson$, postBinary$, delete$}
