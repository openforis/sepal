const base64 = require('base-64')
const {Subject, of, range, throwError, timer, zip, catchError, mergeMap, map, retryWhen} = require('rxjs')
const request = require('request')
const log = require('sepal/log').getLogger('httpClient')

const DEFAULT_RETRIES = 4

const get$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'GET', {
        retries,
        query,
        body,
        headers,
        validStatuses,
        ...args
    })

const post$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'POST', {
        retries,
        query,
        body: toQueryString(body),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            ...headers
        },
        validStatuses,
        ...args
    })

const postJson$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'POST', {
        retries,
        body: body && JSON.stringify(body),
        query,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...headers
        },
        validStatuses,
        ...args
    })

const postBinary$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'POST', {
        retries,
        query,
        body,
        headers: {
            'Content-Type': 'application/octet-stream',
            ...headers
        },
        validStatuses,
        ...args
    })

const delete$ = (url, {retries = DEFAULT_RETRIES, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'DELETE', {
        retries,
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

const execute$ = (url, method, {retries, query, username, password, headers, validStatuses, ...args}) => {
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
        retryWhen(function (error$) {
            return zip(
                error$,
                range(1, retries + 1)
            ).pipe(
                mergeMap(
                    ([error, retry]) => {
                        if (error.statusCode < 500 || retry > retries)
                            return throwError(() => error)
                        else
                            return timer(Math.pow(2, retry) * 200)
                    }
                )
            )
        })
    )
}

module.exports = {get$, post$, postJson$, postBinary$, delete$, toQueryString}
