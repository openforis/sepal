import base64 from 'base-64'
import _ from 'lodash'
import {catchError, map, of, throwError} from 'rxjs'
import {ajax} from 'rxjs/ajax'
import {webSocket} from 'rxjs/webSocket'

import {autoRetry} from '~/rxjsutils'
import {msg} from '~/translate'
import {logout$} from '~/user'
import {applyDefaults} from '~/utils'
import {Notifications} from '~/widget/notifications'
 
const DEFAULT_RETRY_CONFIG = {
    maxRetries: 5,
    minRetryDelay: 500,
    maxRetryDelay: 2000,
    retryDelayFactor: 2,
    abort: error => error.status && error.status < 500
}

const toResponse = map(e => e.response)

export const get$ = (url, {query, body, headers, validStatuses, retry, ...args} = {}) =>
    execute$(url, 'GET', {
        query,
        body,
        headers,
        validStatuses,
        retry,
        ...args
    }).pipe(toResponse)

export const post$ = (url, {query, body, headers, validStatuses, retry, ...args} = {}) =>
    execute$(url, 'POST', {
        query,
        body: toQueryString(body),
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            ...headers
        },
        validStatuses,
        retry,
        ...args
    }).pipe(toResponse)

export const postJson$ = (url, {query, body, headers, validStatuses, retry, ...args} = {}) =>
    execute$(url, 'POST', {
        query,
        body: body && JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...headers
        },
        validStatuses,
        retry,
        ...args
    }).pipe(toResponse)

export const postBinary$ = (url, {query, body, headers, validStatuses, retry, ...args} = {}) =>
    execute$(url, 'POST', {
        query,
        body,
        headers: {
            'Content-Type': 'application/octet-stream',
            ...headers
        },
        validStatuses,
        retry,
        ...args
    }).pipe(toResponse)

export const delete$ = (url, {query, body, headers, validStatuses, retry, ...args} = {}) =>
    execute$(url, 'DELETE', {
        query,
        body,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            ...headers
        },
        validStatuses,
        retry,
        ...args
    }).pipe(toResponse)

export const deleteJson$ = (url, {query, body, headers, validStatuses, retry, ...args} = {}) =>
    execute$(url, 'DELETE', {
        query,
        body: body && JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...headers
        },
        validStatuses,
        retry,
        ...args
    }).pipe(toResponse)

export const WebSocket = (url, retry) => {
    const buildNumber = window._sepal_global_.buildNumber
    const upstream$ = webSocket({
        url: webSocketUrl(url),
        openObserver: {
            next: () => upstream$.next({version: {buildNumber}})
        }
    })

    const downstream$ = upstream$.pipe(
        autoRetry(
            applyDefaults(DEFAULT_RETRY_CONFIG, retry)
        )
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
    query,
    username,
    password,
    headers,
    validStatuses,
    retry,
    ...args
}) => {
    const queryString = toQueryString(query)
    let urlWithQuery = queryString ? `${url}?${queryString}` : url
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        headers = {
            'No-auth-challenge': true,
            ...headers
        }
    }
    if (username || password) {
        headers = {
            'Authorization': `Basic ${base64.encode(`${username}:${password}`)}`,
            ...headers
        }
    }
    const t0 = Date.now()
    return ajax({url: urlWithQuery, method, headers, ...args}).pipe(
        map(response => validateResponse(response, validStatuses)),
        catchError(error => {
            if (validStatuses && validStatuses.includes(error.status)) {
                return of(error)
            } else if (error.status === 401 && isRelative(url)) {
                Notifications.warning({message: msg('unauthorized.warning'), group: true})
                return logout$()
            } else {
                return throwError(() => error)
            }
        }),
        autoRetry(
            applyDefaults(DEFAULT_RETRY_CONFIG, {
                initialTimestamp: t0,
                ...retry
            })
        )
    )
}

const isRelative = url =>
    !/^\w+:\/\//i.test(url) // Not starting with protocol://
