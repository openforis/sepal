const {ceoUrl} = require('../config')
const {ClientException} = require('sepal/src/exception')
const urljoin = require('url-join').default
const {map} = require('rxjs')
const {post$} = require('#sepal/httpClient')

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
            const cookiesToSet = response.headers['set-cookie']
            if (!cookiesToSet) {
                throw new ClientException('email or password are invalid', {
                    userMessage: {
                        message: 'email or password are invalid',
                        key: 'process.classification.panel.trainingData.form.ceo.login.invalid.credentials'
                    }
                })
            }
            return {
                sessionCookie: cookiesToSet[0]
            }
        })
    )
}

module.exports = {loginToken$}
