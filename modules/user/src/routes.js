import {wsStream} from '#sepal/httpServer'

import {requireAdmin, requireAuth} from './currentUser.js'
import ws$ from './ws.js'

export const createRoutes = ({userApi, sshKeyApi}) => router => router
    .get('/healthcheck', ctx => {
        ctx.body = {status: 'ok'}
    })
    // NO_AUTH
    .post('/auth/password', ctx => userApi.authPassword(ctx))
    .get('/auth/authorized-keys', ctx => sshKeyApi.authorizedKeys(ctx))
    .get('/nss/snapshot', ctx => userApi.nssSnapshot(ctx))
    .post('/activate', ctx => userApi.activate(ctx))
    .post('/authenticate', ctx => userApi.authenticate(ctx))
    .get('/google/access-request-callback', ctx => userApi.googleAccessRequestCallback(ctx))
    .post('/password/reset', ctx => userApi.resetPassword(ctx))
    .post('/password/reset-request', ctx => userApi.requestPasswordReset(ctx))
    .post('/validate/email', ctx => userApi.validateEmail(ctx))
    .post('/validate/token', ctx => userApi.validateToken(ctx))
    .post('/signup', ctx => userApi.signup(ctx))
    .post('/validate/username', ctx => userApi.validateUsername(ctx))
    // AUTH
    .post('/login', requireAuth, ctx => userApi.current(ctx))
    .get('/current', requireAuth, ctx => userApi.current(ctx))
    .post('/current/password', requireAuth, ctx => userApi.changePassword(ctx))
    .post('/current/details', requireAuth, ctx => userApi.updateCurrentDetails(ctx))
    .post('/current/acceptPrivacyPolicy', requireAuth, ctx => userApi.acceptPrivacyPolicy(ctx))
    .get('/current/ssh-keys', requireAuth, ctx => sshKeyApi.list(ctx))
    .post('/current/ssh-keys', requireAuth, ctx => sshKeyApi.add(ctx))
    .delete('/current/ssh-keys/:id', requireAuth, ctx => sshKeyApi.remove(ctx))
    .get('/google/access-request-url', requireAuth, ctx => userApi.googleAccessRequestUrl(ctx))
    .get('/google/associate-account', requireAuth, ctx => userApi.associateGoogleAccount(ctx))
    .post('/google/refresh-access-token', requireAuth, ctx => userApi.refreshGoogleAccessToken(ctx))
    .post('/google/revoke-access', requireAuth, ctx => userApi.revokeGoogleAccess(ctx))
    .post('/google/project', requireAuth, ctx => userApi.updateGoogleProject(ctx))
    // ADMIN
    .post('/details', requireAdmin, ctx => userApi.updateDetails(ctx))
    .post('/lock', requireAdmin, ctx => userApi.lock(ctx))
    .post('/unlock', requireAdmin, ctx => userApi.unlock(ctx))
    .get('/info', requireAdmin, ctx => userApi.info(ctx))
    .get('/list', requireAdmin, ctx => userApi.list(ctx))
    .get('/mostRecentLogin', requireAdmin, ctx => userApi.mostRecentLogin(ctx))
    .get('/mostRecentLoginByUser', requireAdmin, ctx => userApi.mostRecentLoginByUser(ctx))
    .get('/email-notifications-enabled/:email', requireAdmin, ctx => userApi.emailNotificationsEnabled(ctx))

export const wsRoutes = {
    '/ws': wsStream(ctx => ws$(ctx))
}
