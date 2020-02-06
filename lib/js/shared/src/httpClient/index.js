const base64 = require('base-64')
const {Subject, of, range, throwError, timer, zip} = require('rxjs')
const {catchError, flatMap, map, retryWhen} = require('rxjs/operators')
const request = require('request')

const DEFAULT_RETRIES = 4

const get$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) => {
    return execute$(url, 'GET', {
        retries,
        query,
        body,
        headers,
        validStatuses, ...args
    })
}

const post$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'POST', {
        retries,
        query,
        body,
        headers,
        validStatuses, ...args
    })

const postForm$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    post$(
        url, {
            retries,
            query,
            body: toQueryString(body),
            headers: {
                ...headers,
                'Content-Type': 'application/x-www-form-urlencoded'
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
            ...headers,
            'Content-Type': 'application/json'
        },
        validStatuses,
        ...args
    })

const delete$ = (url, {retries = DEFAULT_RETRIES, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'DELETE', {
        retries,
        headers,
        validStatuses, ...args
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
    !validStatuses || validStatuses.includes(response.status)
        ? response
        : throwError(response)

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
    request(options, (error, response, body) => {
        const status = response.statusCode
        if (error) {
            request$.error(error)
        } else if (status >= 400) {
            const e = new Error(`${method} ${url}: ${status} ${response.statusMessage}`)
            e.request = options
            e.body = body
            request$.error(e)
        } else {
            response.body = body
            request$.next(response)
            request$.complete()
        }
    })
    return request$.pipe(
        map(response => validateResponse(response, validStatuses)),
        catchError(e => {
            if (validStatuses && validStatuses.includes(e.statusCode)) {
                return of(e)
            } else {
                return throwError(e)
            }
        }),
        retryWhen(function (error$) {
            return zip(
                error$,
                range(1, retries + 1)
            ).pipe(
                flatMap(
                    ([error, retry]) => {
                        if (error.statusCode < 500 || retry > retries)
                            return throwError(error)
                        else
                            return timer(Math.pow(2, retry) * 200)
                    }
                )
            )
        })
    )
}

module.exports = {get$, post$, postForm$, postJson$, delete$}
