import {wsStream} from '#sepal/httpServer'

import {requireAdmin, requireAuth} from './currentUser.js'
import * as api from './userApi.js'
import ws$ from './ws.js'

const routes = router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    // NO_AUTH
    .post('/auth/password', api.authPassword)
    .get('/auth/authorized-keys', api.authorizedKeys)
    .get('/nss/snapshot', api.nssSnapshot)
    .post('/activate', api.activate)
    .post('/authenticate', api.authenticate)
    .get('/google/access-request-callback', api.googleAccessRequestCallback)
    .post('/password/reset', api.resetPassword)
    .post('/password/reset-request', api.requestPasswordReset)
    .post('/validate/email', api.validateEmail)
    .post('/validate/token', api.validateToken)
    .post('/signup', api.signup)
    .post('/validate/username', api.validateUsername)
    // AUTH
    .post('/login', requireAuth, api.current)
    .get('/current', requireAuth, api.current)
    .post('/current/password', requireAuth, api.changePassword)
    .post('/current/details', requireAuth, api.updateCurrentDetails)
    .post('/current/acceptPrivacyPolicy', requireAuth, api.acceptPrivacyPolicy)
    .get('/google/access-request-url', requireAuth, api.googleAccessRequestUrl)
    .get('/google/associate-account', requireAuth, api.associateGoogleAccount)
    .post('/google/refresh-access-token', requireAuth, api.refreshGoogleAccessToken)
    .post('/google/revoke-access', requireAuth, api.revokeGoogleAccess)
    .post('/google/project', requireAuth, api.updateGoogleProject)
    // ADMIN
    .post('/details', requireAdmin, api.updateDetails)
    .post('/lock', requireAdmin, api.lock)
    .post('/unlock', requireAdmin, api.unlock)
    .get('/info', requireAdmin, api.info)
    .get('/list', requireAdmin, api.list)
    .get('/mostRecentLogin', requireAdmin, api.mostRecentLogin)
    .get('/mostRecentLoginByUser', requireAdmin, api.mostRecentLoginByUser)
    .get('/email-notifications-enabled/:email', requireAdmin, api.emailNotificationsEnabled)

const wsRoutes = {
    '/ws': wsStream(ctx => ws$(ctx))
}

export {routes, wsRoutes}
