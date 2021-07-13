import {ajax} from 'rxjs/ajax'
import {catchError, map, mergeMap, retryWhen} from 'rxjs/operators'
import {logout$} from 'user'
import {msg} from 'translate'
import {of, range, throwError, timer, zip} from 'rxjs'
import Notifications from 'widget/notifications'
import base64 from 'base-64'

const DEFAULT_RETRIES = 4

export const get$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'GET', {
        retries,
        query,
        body,
        headers,
        validStatuses,
        ...args
    })

export const post$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'POST', {
        retries,
        query,
        body,
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
            ...headers
        },
        validStatuses,
        ...args
    })

export const postForm$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
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
    })

export const delete$ = (url, {retries = DEFAULT_RETRIES, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'DELETE', {
        retries,
        headers,
        validStatuses,
        ...args
    })

export default {get$, post$, postJson$, delete$}

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
        : throwError(response)

const execute$ = (url, method, {retries, query, username, password, headers, validStatuses, ...args}) => {
    const queryString = toQueryString(query)
    let urlWithQuery = queryString ? `${url}?${queryString}` : url
    if (!url.startsWith('http://') && !url.startsWith('https://'))
        headers = {'No-auth-challenge': true, ...headers}
    if (username || password)
        headers = {
            'Authorization': `Basic ${base64.encode(`${username}:${password}`)}`,
            ...headers
        }
    return ajax({url: urlWithQuery, method, headers, ...args}).pipe(
        map(response => validateResponse(response, validStatuses)),
        catchError(e => {
            if (validStatuses && validStatuses.includes(e.status)) {
                return of(e)
            } else if (e.status === 401 && isRelative(url)) {
                Notifications.warning({message: msg('unauthorized.warning'), group: true})
                return logout$()
            } else {
                return throwError(e)
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
                            return throwError(error)
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
