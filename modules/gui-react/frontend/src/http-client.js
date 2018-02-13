import fetch from 'cross-fetch'
import base64 from 'base-64'

export default class Http {
    static get(path, {username, password, handle, headers = {}, retries = 5, ...args} = {}) {
        return execute('GET', path, {
            ...args,
            username: username,
            password: password,
            handle: handle,
            headers: headers,
            retries: retries
        })
    }

    static post(path, {username, password, handle, headers = {}, retries = 5, ...args} = {}) {
        return execute('POST', path, {
            ...args,
            username: username,
            password: password,
            handle: handle,
            headers: headers,
            retries: retries
        })
    }
}

function execute(method, path, {username, password, handle, headers = {}, retries = 0, ...args}, retry = 0) {
    function retryOrReject(fail) {
        if (retry < retries) {
            const millis = Math.pow(2, retry) * 200
            console.log(`Retrying HTTP ${method} ${path} in ${millis} millis (retry ${retry + 1})`)
            return delay(millis).then(() => execute(method, path, {
                ...args,
                username: username,
                password: password,
                handle: handle,
                headers: headers,
                retries: retries
            }, retry + 1))
        } else {
            console.log(`Failed HTTP ${method} ${path}`)
            return Promise.reject(fail())
        }
    }

    if (username || password)
        headers = Object.assign(headers, {
            'Authorization': 'Basic ' + base64.encode(username + ":" + password)
        })
    headers = Object.assign(headers, {
        'No-auth-challenge': true
    })

    return fetch(path, {
        method: method,
        headers: headers,
        credentials: 'include',
        ...args
    })
        .then(
            (response) => {
                const contentType = response.headers.get("content-type")
                if (contentType && contentType.includes("application/json"))
                    return Promise.all([response.json(), response])
                else
                    return [null, response]
            },
            (error) => Promise.reject(error)
        )
        .then(
            ([json, response]) => {
                if (handle) {
                    const handler = handle[response.status]
                    if (handler) {
                        if (json)
                            return Promise.resolve(handler(json, response))
                        else
                            return Promise.resolve(handler(response))
                    } else {
                        return retryOrReject(() => ({
                            message: `Unexpected response status ${response.status}`,
                            json: json,
                            response: response
                        }))
                    }
                } else {
                    if (response.ok)
                        return json ? Promise.resolve(json) : Promise.resolve(response)
                    else
                        return retryOrReject(() => response)
                }
            },
            (error) => retryOrReject(() => error)
        )
}

function delay(t, v) {
    return new Promise(function (resolve) {
        setTimeout(resolve.bind(null, v), t)
    })
}