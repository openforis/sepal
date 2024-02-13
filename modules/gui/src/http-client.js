import {ajax} from 'rxjs/ajax'
import {autoRetry} from 'rxjsutils'
import {catchError, map, of, tap, throwError} from 'rxjs'
import {currentUser, logout$, updateUser} from 'user'
import {getLogger} from 'log'
import {msg} from 'translate'
import {webSocket} from 'rxjs/webSocket'
import Notifications from 'widget/notifications'
import _ from 'lodash'
import base64 from 'base-64'

const log = getLogger('http')

const DEFAULT_MAX_RETRIES = 4
const DEFAULT_MIN_RETRY_DELAY_MS = 500
const DEFAULT_MAX_RETRY_DELAY_MS = 30000
const DEFAULT_RETRY_DELAY_FACTOR = 2

const toResponse = map(e => e.response)

export const get$ = (url, {maxRetries, minRetryDelay, maxRetryDelay, retryDelayFactor, query, body, headers, validStatuses, ...args} = {}) =>
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
    }).pipe(toResponse)

export const post$ = (url, {maxRetries, minRetryDelay, maxRetryDelay, retryDelayFactor, query, body, headers, validStatuses, ...args} = {}) =>
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
    }).pipe(toResponse)

export const postJson$ = (url, {maxRetries, minRetryDelay, maxRetryDelay, retryDelayFactor, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'POST', {
        maxRetries,
        minRetryDelay,
        maxRetryDelay,
        retryDelayFactor,
        query,
        body: body && JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...headers
        },
        validStatuses,
        ...args
    }).pipe(toResponse)

export const postBinary$ = (url, {maxRetries, minRetryDelay, maxRetryDelay, retryDelayFactor, query, body, headers, validStatuses, ...args} = {}) =>
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
    }).pipe(toResponse)

export const delete$ = (url, {maxRetries, minRetryDelay, maxRetryDelay, retryDelayFactor, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'DELETE', {
        maxRetries,
        minRetryDelay,
        maxRetryDelay,
        retryDelayFactor,
        query,
        body,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            ...headers
        },
        validStatuses,
        ...args
    }).pipe(toResponse)

export const deleteJson$ = (url, {maxRetries, minRetryDelay, maxRetryDelay, retryDelayFactor, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'DELETE', {
        maxRetries,
        minRetryDelay,
        maxRetryDelay,
        retryDelayFactor,
        query,
        body: body && JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...headers
        },
        validStatuses,
        ...args
    }).pipe(toResponse)

export const WebSocket = (url, {
    maxRetries = DEFAULT_MAX_RETRIES,
    minRetryDelay = DEFAULT_MIN_RETRY_DELAY_MS,
    maxRetryDelay = DEFAULT_MAX_RETRIES,
    retryDelayFactor = DEFAULT_RETRY_DELAY_FACTOR
} = {}) => {
    const upstream$ = webSocket(webSocketUrl(url))
    const downstream$ = upstream$.pipe(
        autoRetry({
            maxRetries,
            minRetryDelay,
            maxRetryDelay,
            retryDelayFactor,
            abort: error => error.status < 500})
        // retry({
        //     delay: (error, retryCount) => {
        //         if (error.status < 500 || retryCount > maxRetries) {
        //             return throwError(() => error)
        //         }
        //         log.debug(() => `Retrying websocket connection to ${url}: ${retryCount}${maxRetries ? `/${maxRetries}` : ''}`)
        //         return timer(Math.min(maxRetryDelay, minRetryDelay * Math.pow(retryDelayFactor, retryCount - 1)))
        //     }
        // })
    )
    return {upstream$, downstream$}
}
    
const webSocketUrl = url => {
    const {protocol, host} = window.location
    if (url.startsWith('wss:') || url.startsWith('ws:')) {
        return url
    } else {
        if (protocol === 'https:') {
            return `wss://${host}${url}`
        }
        if (protocol === 'http:') {
            return `ws://${host}${url}`
        }
    }
    throw Error(`Cannot determine websocket url: ${url}`)
}

const toQueryStringValue = (key, value) =>
    `${key}=${value === null || value === undefined ? '' : encodeURIComponent(value)}`

const toQueryString = object =>
    object && Object.keys(object)
        .map(key => {
            const value = object[key]
            return _.isArray(value)
                ? value.map(value => toQueryStringValue(key, value)).join('&')
                : toQueryStringValue(key, value)
        })
        .join('&')

const validateResponse = (response, validStatuses) =>
    !validStatuses || validStatuses.includes(response.status)
        ? response
        : throwError(() => response)

const execute$ = (url, method, {
    maxRetries = DEFAULT_MAX_RETRIES,
    minRetryDelay = DEFAULT_MIN_RETRY_DELAY_MS,
    maxRetryDelay = DEFAULT_MAX_RETRY_DELAY_MS,
    retryDelayFactor = DEFAULT_RETRY_DELAY_FACTOR,
    query,
    username,
    password,
    headers,
    validStatuses,
    ...args
}) => {
    const queryString = toQueryString(query)
    let urlWithQuery = queryString ? `${url}?${queryString}` : url
    if (!url.startsWith('http://') && !url.startsWith('https://'))
        headers = {'No-auth-challenge': true, ...headers}
    if (username || password) {
        headers = {
            'Authorization': `Basic ${base64.encode(`${username}:${password}`)}`,
            ...headers
        }
    }
    return ajax({url: urlWithQuery, method, headers, ...args}).pipe(
        tap(({responseHeaders}) => {
            if (responseHeaders['sepal-user']) { // Make sure the user is up-to-date. Google Tokens might have changed
                const previousUser = _.omit(currentUser(), ['googleTokens']) // make sure googleTokens are always updated
                const updatedUser = JSON.parse(responseHeaders['sepal-user'])
                const user = {...previousUser, ...updatedUser}
                updateUser(user)
            }
        }),
        map(response => validateResponse(response, validStatuses)),
        catchError(e => {
            if (validStatuses && validStatuses.includes(e.status)) {
                return of(e)
            } else if (e.status === 401 && isRelative(url)) {
                Notifications.warning({message: msg('unauthorized.warning'), group: true})
                return logout$()
            } else {
                return throwError(() => e)
            }
        }),
        autoRetry({
            maxRetries,
            minRetryDelay,
            maxRetryDelay,
            retryDelayFactor,
            abort: error => error.status < 500
        })
        // retry({
        //     delay: (error, retryCount) => {
        //         if (error.status < 500 || retryCount > maxRetries) {
        //             return throwError(() => error)
        //         }
        //         log.debug(() => `Retrying websocket connection to ${url}: ${retryCount}${maxRetries ? `/${maxRetries}` : ''}`)
        //         return timer(Math.min(maxRetryDelay, minRetryDelay * Math.pow(retryDelayFactor, retryCount - 1)))
        //     }
        // })
    )
}

const isRelative = url =>
    !/^\w+:\/\//i.test(url) // Not starting with protocol://
