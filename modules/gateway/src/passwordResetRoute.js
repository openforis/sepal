import express from 'express'
import {firstValueFrom} from 'rxjs'

import {post$} from '#sepal/httpClient'
import {getLogger} from '#sepal/log'

import modules from '../config/modules.json' with {type: 'json'}
import {usernameTag} from './tag.js'

const log = getLogger('passwordResetRoute')

const PASSWORD_RESET_URL = `http://${modules.user}/password/reset`

const OK = 200
const BAD_REQUEST = 400
const UNAUTHORIZED = 401

// A reset proves control of the account's email, so it logs the browser in itself. A separate login with the new
// password would be subject to the login throttle, which must not keep a user out of an account they just recovered.
export const passwordResetRoute = startSession => [
    express.urlencoded({extended: false}),
    express.json(),
    async (req, res) => {
        try {
            const {statusCode, body} = await firstValueFrom(post$(PASSWORD_RESET_URL, {
                body: req.body,
                responseType: 'json',
                validStatuses: [OK, BAD_REQUEST]
            }))
            if (statusCode !== OK) {
                res.status(statusCode).json(body)
                return
            }
            const user = await startSession(req, res, body)
            if (user) {
                log.info(`${usernameTag(user.username)} Logged in by password reset`)
                res.status(OK).json(user)
            } else {
                log.info(`${usernameTag(body.username)} Not logged in by password reset, the user is no longer active`)
                res.status(UNAUTHORIZED).end()
            }
        } catch (error) {
            log.error('Password reset failed', error)
            res.status(500).end()
        }
    }
]
