import {ajax} from 'rxjs/ajax'
import {catchError, map, mergeMap, of, range, retryWhen, tap, throwError, timer, zip} from 'rxjs'
import {getLogger} from 'log'
import {logout$, updateUser} from 'user'
import {msg} from 'translate'
import {webSocket} from 'rxjs/webSocket'
import Notifications from 'widget/notifications'
import _ from 'lodash'
import base64 from 'base-64'

const log = getLogger('http')

const DEFAULT_RETRIES = 4

const toResponse = map(e => e.response)

export const get$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'GET', {
        retries,
        query,
        body,
        headers,
        validStatuses,
        ...args
    }).pipe(toResponse)

export const post$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
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
    }).pipe(toResponse)

export const postJson$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'POST', {
        retries,
        query,
        body: body && JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...headers
        },
        validStatuses,
        ...args
    }).pipe(toResponse)

export const postBinary$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
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
    }).pipe(toResponse)

export const delete$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'DELETE', {
        retries,
        query,
        body,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            ...headers
        },
        validStatuses,
        ...args
    }).pipe(toResponse)

export const deleteJson$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'DELETE', {
        retries,
        query,
        body: body && JSON.stringify(body),
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            ...headers
        },
        validStatuses,
        ...args
    }).pipe(toResponse)

export const WebSocket = (url, {maxRetries} = {}) => {
    const upstream$ = webSocket(webSocketUrl(url))
    let retry = 0
    const downstream$ = upstream$.pipe(
        retryWhen(error$ =>
            error$.pipe(
                tap(() => retry++),
                mergeMap(
                    error => (error.status < 500 || retry > maxRetries)
                        ? throwError(() => error)
                        : timer(Math.pow(2, Math.min((retry - 1), 4)) * 500)
                ),
                tap(() => log.debug(() => `Retrying websocket connection to ${url}: ${retry}${maxRetries ? `/${maxRetries}` : ''}`))
            )
        ),
        tap(() => retry = 0)
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
        
const toQueryString = object =>
    object && Object.keys(object)
        .map(key => {
            const value = object[key]
            return `${key}=${value === null || value === undefined ? '' : encodeURIComponent(value)}`
        })
        .join('&')

const validateResponse = (response, validStatuses) =>
    !validStatuses || validStatuses.includes(response.status)
        ? response
        : throwError(() => response)

// const execute$ = (url, method, {retries, query, basicAuth, username, password, headers, validStatuses, ...args}) => {
const execute$ = (url, method, {retries, query, basicAuth, headers, validStatuses, ...args}) => {
    const queryString = toQueryString(query)
    let urlWithQuery = queryString ? `${url}?${queryString}` : url
    if (!url.startsWith('http://') && !url.startsWith('https://'))
        headers = {'No-auth-challenge': true, ...headers}
    if (basicAuth) {
        headers = {
            'Authorization': `Basic ${base64.encode(_.castArray(basicAuth).join(':'))}`,
            ...headers
        }
    }
    // if (username || password) {
    //     log.error('basic auth!')
    //     headers = {
    //         'Authorization': `Basic ${base64.encode(`${username}:${password}`)}`,
    //         ...headers
    //     }
    // }
    return ajax({url: urlWithQuery, method, headers, ...args}).pipe(
        tap(({responseHeaders}) => {
            if (responseHeaders['sepal-user']) { // Make sure the user is up-to-date. Google Tokens might have changed
                const user = JSON.parse(responseHeaders['sepal-user'])
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
        retryWhen(function (error$) {
            return zip(
                error$,
                range(1, retries + 1)
            ).pipe(
                mergeMap(
                    ([error, retry]) => {
                        if (error.status < 500 || retry > retries)
                            return throwError(() => error)
                        else
                            return timer(Math.pow(2, retry) * 200)
                    }
                )
            )
        })
    )
}

const isRelative = url =>
    !/^\w+:\/\//i.test(url) // Not starting with protocol://
