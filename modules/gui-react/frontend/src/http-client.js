import Rx from 'rxjs'
import base64 from 'base-64'

export default class Http {
    static get$(url, {retries = 4, headers, validStatuses, ...args}) {
        return execute$(url, 'GET', {retries, headers, validStatuses, ...args})
    }

    static post$(url, {retries = 4, headers, validStatuses, ...args}) {
        return execute$(url, 'POST', {retries, headers, validStatuses, ...args})
    }
}

function execute$(url, method, {retries, username, password, headers, validStatuses, ...args}) {
    headers = {'No-auth-challenge': true, ...headers}
    if (username || password)
        headers = {
            'Authorization': 'Basic ' + base64.encode(username + ':' + password),
            ...headers
        }

    return Rx.Observable.ajax({
        url: url,
        method: method,
        headers,
        ...args
    })
        .map(e => {
            if (!validStatuses || validStatuses.includes(e.status))
                return e
            else
                return Rx.Observable.throw(e)
        })
        .catch(e => {
            if (validStatuses && validStatuses.includes(e.status))
                return Rx.Observable.of(e)
            else
                return Rx.Observable.throw(e)
        })
        .retryWhen(function (error$) {
            return Rx.Observable
                .zip(Rx.Observable.range(1, retries + 1), error$)
                .flatMap(
                    ([retry, error$]) => {
                        if (retry > retries)
                            return Rx.Observable.throw(error$)
                        else
                            return Rx.Observable.timer(Math.pow(2, retry) * 200)
                    }
                )
        })
}
