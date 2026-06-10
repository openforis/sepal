import {map} from 'rxjs'
import setCookieParser from 'set-cookie-parser'
import urljoin from 'url-join'

import {ClientException} from '#sepal/exception'
import {post$} from '#sepal/httpClient'

import {ceoUrl} from '../config.js'

const loginToken$ = ctx => {
    const {email, password} = ctx.request.body
    if (!email || !password) {
        throw new ClientException('email and password are required in request body', {
            userMessage: {
                message: 'email and password are required in request body'
            }
        })
    }

    return post$(urljoin(ceoUrl, 'login'), {
        body: {
            email,
            password,
        }
    }).pipe(
        map(response => {
            const rawHeader = response.headers.get('set-cookie') || ''
            const cookieStrings = setCookieParser.splitCookiesString(rawHeader)
            const cookies = setCookieParser.parse(cookieStrings, {decodeValues: false})
            const cookieToSet = cookies.find(c => c.name === 'ring-session')
            if (!cookieToSet) {
                throw new ClientException('email or password are invalid', {
                    userMessage: {
                        message: 'email or password are invalid',
                        key: 'process.classification.panel.trainingData.form.ceo.login.invalid.credentials'
                    }
                })
            }
            return {
                sessionCookie: `${cookieToSet.name}=${cookieToSet.value}`
            }
        })
    )
}

export {loginToken$}
