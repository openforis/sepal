import Notifications from 'app/notifications'
import base64 from 'base-64'
import {of, range, throwError, timer} from 'rxjs'
import {ajax} from 'rxjs/ajax'
import {catchError, flatMap, map, retryWhen, zip} from 'rxjs/operators'
import {logout} from 'user'

export default class Http {
    static get$(url, {retries = 4, headers, validStatuses, ...args} = {}) {
        return execute$(url, 'GET', {retries, headers, validStatuses, ...args})
    }

    static post$(url, {retries = 4, headers, validStatuses, ...args} = {}) {
        return execute$(url, 'POST', {retries, headers, validStatuses, ...args})
    }

    static postJson$(url, body, {retries = 4, headers, validStatuses, ...args} = {}) {
        return execute$(url, 'POST', {
            retries,
            body: JSON.stringify(body),
            headers: {
                ...headers,
                'Content-Type': 'application/json'
            },
            validStatuses,
            ...args
        })
    }

    static delete$(url, {retries = 4, headers, validStatuses, ...args} = {}) {
        return execute$(url, 'DELETE', {retries, headers, validStatuses, ...args})
    }
}

function execute$(url, method, {retries, username, password, headers, validStatuses, ...args}) {
    headers = {'No-auth-challenge': true, ...headers}
    if (username || password)
        headers = {
            'Authorization': 'Basic ' + base64.encode(username + ':' + password),
            ...headers
        }
    return ajax({
        url: url,
        method: method,
        headers,
        ...args
    }).pipe(
        map(e => {
            if (!validStatuses || validStatuses.includes(e.status))
                return e
            else
                return throwError(e)
        }),
        catchError(e => {
            if (validStatuses && validStatuses.includes(e.status))
                return of(e)
            else if (e.status === 401) {
                Notifications.warning('unauthorized').dispatch()
                logout()
            } else
                return throwError(e)
        }),
        retryWhen(function (error$) {
            return error$.pipe(
                zip(range(1, retries + 1)),
                flatMap(
                    ([retry, error$]) => {
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
