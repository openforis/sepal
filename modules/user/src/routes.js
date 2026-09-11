import {wsStream} from '#sepal/httpServer'

import {requireAdmin, requireAuth} from './currentUser.js'
import ws$ from './ws.js'

export const createRoutes = api => router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    // NO_AUTH
    .post('/auth/password', ctx => api.authPassword(ctx))
    .get('/auth/authorized-keys', ctx => api.authorizedKeys(ctx))
    .get('/nss/snapshot', ctx => api.nssSnapshot(ctx))
    .post('/activate', ctx => api.activate(ctx))
    .post('/authenticate', ctx => api.authenticate(ctx))
    .get('/google/access-request-callback', ctx => api.googleAccessRequestCallback(ctx))
    .post('/password/reset', ctx => api.resetPassword(ctx))
    .post('/password/reset-request', ctx => api.requestPasswordReset(ctx))
    .post('/validate/email', ctx => api.validateEmail(ctx))
    .post('/validate/token', ctx => api.validateToken(ctx))
    .post('/signup', ctx => api.signup(ctx))
    .post('/validate/username', ctx => api.validateUsername(ctx))
    // AUTH
    .post('/login', requireAuth, ctx => api.current(ctx))
    .get('/current', requireAuth, ctx => api.current(ctx))
    .post('/current/password', requireAuth, ctx => api.changePassword(ctx))
    .post('/current/details', requireAuth, ctx => api.updateCurrentDetails(ctx))
    .post('/current/acceptPrivacyPolicy', requireAuth, ctx => api.acceptPrivacyPolicy(ctx))
    .get('/google/access-request-url', requireAuth, ctx => api.googleAccessRequestUrl(ctx))
    .get('/google/associate-account', requireAuth, ctx => api.associateGoogleAccount(ctx))
    .post('/google/refresh-access-token', requireAuth, ctx => api.refreshGoogleAccessToken(ctx))
    .post('/google/revoke-access', requireAuth, ctx => api.revokeGoogleAccess(ctx))
    .post('/google/project', requireAuth, ctx => api.updateGoogleProject(ctx))
    // ADMIN
    .post('/details', requireAdmin, ctx => api.updateDetails(ctx))
    .post('/lock', requireAdmin, ctx => api.lock(ctx))
    .post('/unlock', requireAdmin, ctx => api.unlock(ctx))
    .get('/info', requireAdmin, ctx => api.info(ctx))
    .get('/list', requireAdmin, ctx => api.list(ctx))
    .get('/mostRecentLogin', requireAdmin, ctx => api.mostRecentLogin(ctx))
    .get('/mostRecentLoginByUser', requireAdmin, ctx => api.mostRecentLoginByUser(ctx))
    .get('/email-notifications-enabled/:email', requireAdmin, ctx => api.emailNotificationsEnabled(ctx))

export const wsRoutes = {
    '/ws': wsStream(ctx => ws$(ctx))
}
