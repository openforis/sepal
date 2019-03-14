import {ajax} from 'rxjs/ajax'
import {catchError, flatMap, map, retryWhen, zip} from 'rxjs/operators'
import {logout} from 'widget/user'
import {msg} from 'translate'
import {of, range, throwError, timer} from 'rxjs'
import Notifications from 'widget/notifications'
import base64 from 'base-64'

const DEFAULT_RETRIES = 4

export const get$ = (url, {retries = DEFAULT_RETRIES, query, headers, validStatuses, ...args} = {}) => {
    return execute$(url, 'GET', {
        retries,
        query,
        headers,
        validStatuses, ...args
    })
}

export const post$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'POST', {
        retries,
        query,
        body,
        headers,
        validStatuses, ...args
    })

export const postForm$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
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
            args
        })

export const postJson$ = (url, {retries = DEFAULT_RETRIES, query, body, headers, validStatuses, ...args} = {}) =>
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

export const delete$ = (url, {retries = DEFAULT_RETRIES, headers, validStatuses, ...args} = {}) =>
    execute$(url, 'DELETE', {
        retries,
        headers,
        validStatuses, ...args
    })

export default {get$, post$, postJson$, delete$}

function toQueryString(object) {
    return object &&
        Object.keys(object)
            .map(key => `${key}=${encodeURIComponent(object[key])}`)
            .join('&')
}

function execute$(url, method, {retries, query, username, password, headers, validStatuses, ...args}) {
    const queryString = toQueryString(query)
    let urlWithQuery = queryString ? `${url}?${queryString}` : url
    headers = {'No-auth-challenge': true, ...headers}
    if (username || password)
        headers = {
            'Authorization': 'Basic ' + base64.encode(username + ':' + password),
            ...headers
        }
    return ajax({url: urlWithQuery, method, headers, ...args}).pipe(
        map(e => {
            if (!validStatuses || validStatuses.includes(e.status))
                return e
            else
                return throwError(e)
        }),
        catchError(e => {
            if (validStatuses && validStatuses.includes(e.status)) {
                return of(e)
            } else if (e.status === 401 && isRelative(url)) {
                Notifications.warning({message: msg('unauthorized.warning')})
                return logout()
            } else {
                return throwError(e)
            }
        }),
        retryWhen(function (error$) {
            return error$.pipe(
                zip(range(1, retries + 1)),
                flatMap(
                    ([error$, retry]) => {
                        if (retry > retries)
                            return throwError(error$)
                        else
                            return timer(Math.pow(2, retry) * 200)
                    }
                )
            )
        })
    )
}

function isRelative(url) {
    return !/^\w+:\/\//i.test(url) // Not starting with protocol://
}
