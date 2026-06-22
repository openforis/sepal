import {getLogger} from '#sepal/log'

import {hashPassword, needsRehash, verifyPassword} from './crypto.js'
import {sendInvite, sendPasswordReset} from './email.js'
import {publishUserLocked, publishUserUpdated} from './events.js'
import {googleOAuth} from './googleOAuth.js'
import {googleService} from './googleService.js'
import {renderGroup, renderPasswd, snapshotVersion} from './nss.js'
import {provision} from './provisioning.js'
import {recaptcha} from './recaptcha.js'
import {generateToken, getOrGenerateToken, isExpired} from './tokens.js'
import {userToMap} from './user.js'
import * as repository from './userRepository.js'
import {isValidEmail, isValidUsername} from './validation.js'

const log = getLogger('userApi')

const readBody = ctx => ctx.request.body || {}

// After a successful password verification, transparently upgrade a legacy/weaker
// hash (e.g. migrated {SSHA}) to the current {SCRYPT} scheme. Never break login on
// failure, so errors are logged and swallowed.
const maybeRehashPassword = async (user, password) => {
    if (needsRehash(user.passwordHash)) {
        try {
            await repository.updatePassword(user.username, hashPassword(password))
            log.info(`Upgraded password hash for '${user.username}'`)
        } catch (error) {
            log.warn(`Password hash upgrade failed for '${user.username}': ${error.message}`)
        }
    }
}

// POST /authenticate {username, password} -> 200 user JSON | 401
const authenticate = async ctx => {
    const {username, password} = readBody(ctx)
    const user = username ? await repository.findByUsername(username) : null
    if (user && user.status === 'ACTIVE' && user.passwordHash && verifyPassword(password, user.passwordHash)) {
        await repository.setLastLoginTime(user.username)
        await maybeRehashPassword(user, password)
        try {
            await googleService.refreshGoogleTokens(user.username, user.googleTokens)
        } catch (error) {
            log.warn(`Google token refresh failed for '${user.username}': ${error.message}`)
        }
        const refreshedUser = await repository.findByUsername(user.username)
        log.info(`Authenticated '${user.username}'`)
        ctx.body = userToMap(refreshedUser)
    } else {
        ctx.status = 401
        ctx.body = {message: 'Invalid username or password'}
    }
}

// /current and /login both return the current user, reloaded from the DB.
const current = async ctx => {
    const user = await repository.findByUsername(ctx.state.currentUser.username)
    if (!user) {
        ctx.status = 404
        ctx.body = {message: 'User not found'}
        return
    }
    ctx.body = userToMap(user)
}

// GET /info?username= (admin) -> user JSON
const info = async ctx => {
    const username = ctx.query.username
    const user = username ? await repository.findByUsername(username) : null
    if (!user) {
        ctx.status = 404
        ctx.body = {message: 'User not found'}
        return
    }
    ctx.body = userToMap(user)
}

// GET /list (admin) -> array of users without google tokens
const list = async ctx => {
    const users = await repository.listUsers()
    ctx.body = users.map(user => userToMap(user, false))
}

const mostRecentLogin = async ctx => {
    ctx.body = await repository.mostRecentLogin(ctx.query.username)
}

const mostRecentLoginByUser = async ctx => {
    ctx.body = await repository.mostRecentLoginByUser()
}

const emailNotificationsEnabled = async ctx => {
    const enabled = await repository.emailNotificationsEnabled(ctx.params.email)
    ctx.body = {emailNotificationsEnabled: enabled}
}

// POST /validate/token {token} -> {status, token, user|reason, message}
const validateToken = async ctx => {
    const token = readBody(ctx).token || ctx.query.token
    const user = token ? await repository.findByToken(token) : null
    if (!user) {
        ctx.body = {status: 'failure', token: null, reason: 'invalid', message: 'Token is invalid'}
        return
    }
    const ageMs = Date.now() - (user.tokenGenerationTime || 0)
    if (ageMs > 24 * 60 * 60 * 1000) {
        ctx.body = {status: 'failure', token, reason: 'expired', message: 'Token is expired'}
        return
    }
    ctx.body = {status: 'success', token, user: userToMap(user), message: 'Token is valid'}
}

// POST /current/password {oldPassword, newPassword} -> {status, message}. No event, no header.
const changePassword = async ctx => {
    const {oldPassword, newPassword} = readBody(ctx)
    const user = await repository.findByUsername(ctx.state.currentUser.username)
    if (user && user.passwordHash && verifyPassword(oldPassword, user.passwordHash)) {
        await repository.updatePassword(user.username, hashPassword(newPassword))
        ctx.body = {status: 'success', message: 'Password changed'}
    } else {
        ctx.body = {status: 'failure', message: 'Invalid old password'}
    }
}

// Shared detail-update core. adminValue forces the admin flag (self-update cannot self-elevate).
const applyDetails = async (ctx, {targetUsername, adminValue}) => {
    const body = readBody(ctx)
    await repository.updateUserDetails({
        username: targetUsername,
        name: body.name,
        email: body.email,
        organization: body.organization,
        intendedUse: body.intendedUse,
        emailNotificationsEnabled: body.emailNotificationsEnabled === true || body.emailNotificationsEnabled === 'true',
        manualMapRenderingEnabled: body.manualMapRenderingEnabled === true || body.manualMapRenderingEnabled === 'true',
        admin: adminValue
    })
    const user = await repository.findByUsername(targetUsername)
    if (!user) {
        return null
    }
    publishUserUpdated(user)
    ctx.set('sepal-user-updated', targetUsername)
    return user
}

// POST /current/details -> own details; admin flag forced to the caller's current admin status.
const updateCurrentDetails = async ctx => {
    const current = ctx.state.currentUser
    const user = await applyDetails(ctx, {targetUsername: current.username, adminValue: !!current.admin})
    if (!user) {
        ctx.status = 404
        ctx.body = {message: 'User not found'}
        return
    }
    ctx.body = userToMap(user)
}

// POST /details (admin) -> any user's details; admin flag taken from the body; tokens omitted.
const updateDetails = async ctx => {
    const body = readBody(ctx)
    const user = await applyDetails(ctx, {
        targetUsername: body.username,
        adminValue: body.admin === true || body.admin === 'true'
    })
    if (!user) {
        ctx.status = 404
        ctx.body = {message: 'User not found'}
        return
    }
    ctx.body = userToMap(user, false)
}

// POST /current/acceptPrivacyPolicy -> 204. Sets the refresh header; no event.
const acceptPrivacyPolicy = async ctx => {
    const username = ctx.state.currentUser.username
    await repository.acceptPrivacyPolicy(username)
    ctx.set('sepal-user-updated', username)
    ctx.status = 204
}

// POST /lock (admin) {username} -> userToMap. Publishes UserLocked. Idempotent on already-locked.
const lock = async ctx => {
    const username = (readBody(ctx).username || ctx.query.username || '').toLowerCase()
    const user = await repository.findByUsername(username)
    if (!user) {
        ctx.status = 404
        ctx.body = {message: 'User not found'}
        return
    }
    if (user.status !== 'LOCKED') {
        await repository.updateStatus(username, 'LOCKED')
        const lockedUser = await repository.findByUsername(username)
        publishUserLocked(lockedUser)
        ctx.set('sepal-user-updated', username)
        ctx.body = userToMap(lockedUser)
    } else {
        ctx.body = userToMap(user)
    }
}

// POST /unlock (ADMIN) {username} -> userToMap. Flips a LOCKED user to PENDING, issues a fresh token,
// and emails a password reset. Idempotent: an already-unlocked user is returned unchanged.
// Mirrors the Java UnlockUser flow (no UserUpdated event; sets sepal-user-updated on actual change).
const unlock = async ctx => {
    const username = (readBody(ctx).username || ctx.query.username || '').toLowerCase()
    const user = await repository.findByUsername(username)
    if (!user) {
        ctx.status = 404
        ctx.body = {message: 'User not found'}
        return
    }
    if (user.status !== 'LOCKED') {
        ctx.body = userToMap(user)
        return
    }
    const token = generateToken()
    await repository.updateStatus(username, 'PENDING')
    await repository.updateToken(username, token)
    const unlockedUser = await repository.findByUsername(username)
    sendPasswordReset(unlockedUser, token)
    ctx.set('sepal-user-updated', username)
    ctx.body = userToMap(unlockedUser)
}

const PASSWORD_MIN_LENGTH = 12
const PASSWORD_MAX_LENGTH = 100

// POST /activate {token, password} (NO_AUTH) -> userToMap. Sets the password, flips PENDING->ACTIVE,
// clears the token, publishes UserUpdated. Accepts expired tokens (Java canExpire=false). 400 on a
// blank/invalid password or an unknown token.
const activate = async ctx => {
    const {token, password} = readBody(ctx)
    if (!password || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
        ctx.status = 400
        ctx.body = {message: 'Invalid request'}
        return
    }
    const user = token ? await repository.findByToken(token) : null
    if (!user) {
        ctx.status = 400
        ctx.body = {message: 'Invalid token'}
        return
    }
    await repository.updatePassword(user.username, hashPassword(password))
    await repository.updateStatus(user.username, 'ACTIVE')
    await repository.invalidateToken(token)
    const activated = await repository.findByUsername(user.username)
    publishUserUpdated(activated)
    ctx.body = userToMap(activated)
}

// POST /password/reset {token, password, recaptchaToken} -> userToMap. reCAPTCHA + non-expired token
// (canExpire=true) + not-LOCKED; sets password, status ACTIVE, clears token, publishes UserUpdated.
const resetPassword = async ctx => {
    const {token, password, recaptchaToken} = readBody(ctx)
    if (!(await recaptcha.isValid(recaptchaToken, 'RESET_PASSWORD'))) {
        ctx.status = 400
        ctx.body = {message: 'Invalid request'}
        return
    }
    if (!password || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
        ctx.status = 400
        ctx.body = {message: 'Invalid request'}
        return
    }
    const user = token ? await repository.findByToken(token) : null
    if (!user || isExpired(user.tokenGenerationTime)) {
        ctx.status = 400
        ctx.body = {message: 'Invalid token'}
        return
    }
    if (user.status === 'LOCKED') {
        ctx.status = 400
        ctx.body = {message: 'Account locked'}
        return
    }
    await repository.updatePassword(user.username, hashPassword(password))
    await repository.updateStatus(user.username, 'ACTIVE')
    await repository.invalidateToken(token)
    const updated = await repository.findByUsername(user.username)
    publishUserUpdated(updated)
    ctx.body = userToMap(updated)
}

// POST /validate/username {username, recaptchaToken} -> {valid}. reCAPTCHA + format/blacklist + uniqueness.
const validateUsername = async ctx => {
    const {username, recaptchaToken} = readBody(ctx)
    const lowered = (username || '').toLowerCase()
    const valid = await recaptcha.isValid(recaptchaToken, 'VALIDATE_USERNAME')
        && isValidUsername(lowered)
        && !(await repository.findByUsername(lowered))
    ctx.body = {valid: Boolean(valid)}
}

// POST /validate/email {email, recaptchaToken} -> {valid}. reCAPTCHA + format + uniqueness.
const validateEmail = async ctx => {
    const {email, recaptchaToken} = readBody(ctx)
    const valid = await recaptcha.isValid(recaptchaToken, 'VALIDATE_EMAIL')
        && isValidEmail(email)
        && !(await repository.findByEmail(email))
    ctx.body = {valid: Boolean(valid)}
}

// Validate signup/invite input the way the Java endpoints did: username format,
// non-blank name, email format. Returns true if the (lowercased) username is valid.
const isValidNewUser = ({username, name, email}) =>
    isValidUsername((username || '').toLowerCase()) && Boolean(name) && isValidEmail(email)

// Create a PENDING user, provision its filesystem (uid=gid=id), store the generated public key,
// send the invitation email, and publish UserUpdated. Returns the reloaded user.
// If provision fails after insert, the PENDING row remains without an ssh_public_key (no rollback).
const createInvitedUser = async ({username, name, email, organization, intendedUse}) => {
    const lowered = (username || '').toLowerCase()
    const token = generateToken()
    const id = await repository.insertUser({username: lowered, name, email, organization, intendedUse, token})
    const sshPublicKey = await provision(lowered, id)
    await repository.updateSshPublicKey(lowered, sshPublicKey)
    const user = await repository.findByUsername(lowered)
    sendInvite(user, token)
    publishUserUpdated(user)
    return user
}

// POST /signup (NO_AUTH) {username, name, email, organization, recaptchaToken} -> {status, message}.
const signup = async ctx => {
    const {username, name, email, organization, recaptchaToken} = readBody(ctx)
    if (!(await recaptcha.isValid(recaptchaToken, 'SIGN_UP'))) {
        ctx.body = {status: 'failure', message: 'Signup failed'}
        return
    }
    if (!isValidNewUser({username, name, email})) {
        ctx.status = 400
        ctx.body = {message: 'Invalid request'}
        return
    }
    await createInvitedUser({username, name, email, organization, intendedUse: null})
    ctx.body = {status: 'success', message: 'Signup succeeded'}
}

// POST /invite (ADMIN) {username, name, email, organization} -> userToMap.
const invite = async ctx => {
    const {username, name, email, organization} = readBody(ctx)
    if (!isValidNewUser({username, name, email})) {
        ctx.status = 400
        ctx.body = {message: 'Invalid request'}
        return
    }
    const user = await createInvitedUser({username, name, email, organization, intendedUse: null})
    ctx.body = userToMap(user)
}

// POST /password/reset-request (NO_AUTH) {email, recaptchaToken}. Always returns the same
// generic success message (anti-enumeration); only acts when reCAPTCHA passes and the email maps to
// a non-LOCKED user.
const requestPasswordReset = async ctx => {
    const {email, recaptchaToken} = readBody(ctx)
    ctx.body = {
        status: 'success',
        message: 'If there is an account with this email, an email with a password reset link will be sent there'
    }
    if (!(await recaptcha.isValid(recaptchaToken, 'REQUEST_PASSWORD_RESET'))) {
        log.info(`Ignoring password reset request with invalid reCAPTCHA for email: ${email}`)
        return
    }
    const user = await repository.findByEmail(email)
    if (!user) {
        log.info(`Cannot reset password for non-existing email: ${email}`)
        return
    }
    if (user.status === 'LOCKED') {
        log.info(`Ignoring password reset request for locked user: ${user.username}`)
        return
    }
    const token = getOrGenerateToken(user)
    await repository.updateToken(user.username, token)
    log.info(`Sending password reset email to '${user.username}'`)
    sendPasswordReset(user, token)
}

// GET /google/access-request-url (AUTH) ?destinationUrl -> {url}
const googleAccessRequestUrl = async ctx => {
    ctx.body = {url: googleOAuth.redirectUrl(ctx.query.destinationUrl)}
}

// GET /google/access-request-callback (NO_AUTH) -> HTML meta-refresh to associate-account, querystring preserved.
const googleAccessRequestCallback = async ctx => {
    const url = `/api/user/google/associate-account?${ctx.querystring}`
    ctx.type = 'text/html'
    ctx.body = `<html><head><meta http-equiv="refresh" content="0;URL='${url}'"/></head></html>`
}

// GET /google/associate-account (AUTH) ?code&state -> 302 redirect to state; sets sepal-user-updated.
const associateGoogleAccount = async ctx => {
    const {username} = ctx.state.currentUser
    const tokens = await googleOAuth.requestTokens(ctx.query.code)
    await googleService.saveTokens(username, tokens)
    ctx.set('sepal-user-updated', username)
    ctx.redirect(ctx.query.state)
}

// POST /google/refresh-access-token (AUTH) -> refreshed googleTokens JSON | 204; sets sepal-user-updated.
// refreshGoogleTokens(username) loads the user's stored tokens itself.
const refreshGoogleAccessToken = async ctx => {
    const {username} = ctx.state.currentUser
    const tokens = await googleService.refreshGoogleTokens(username)
    ctx.set('sepal-user-updated', username)
    if (tokens) {
        ctx.body = tokens
    } else {
        ctx.status = 204
    }
}

// POST /google/revoke-access (AUTH) -> userToMap (googleTokens now null); sets sepal-user-updated.
const revokeGoogleAccess = async ctx => {
    const {username} = ctx.state.currentUser
    const user = await repository.findByUsername(username)
    if (user.googleTokens) {
        try {
            await googleOAuth.revokeTokens(user.googleTokens)
        } catch (error) {
            log.info(`Failed to revoke Google tokens for '${username}': ${error.message}`)
        }
    }
    const updated = await googleService.saveTokens(username, null)
    ctx.set('sepal-user-updated', username)
    ctx.body = userToMap(updated)
}

// POST /google/project (AUTH) ?projectId&legacyProject -> 204; sets sepal-user-updated.
const updateGoogleProject = async ctx => {
    const {username} = ctx.state.currentUser
    const user = await repository.findByUsername(username)
    if (user.googleTokens) {
        const legacyProject = ctx.query.legacyProject === 'true'
        const tokens = {
            ...user.googleTokens,
            projectId: legacyProject ? null : (ctx.query.projectId ?? null),
            legacyProject
        }
        await googleService.saveTokens(username, tokens)
        ctx.set('sepal-user-updated', username)
    }
    ctx.status = 204
}

// POST /auth/password {username, password} -> 200 | 401. Backs the ssh-gateway PAM module
// (DB password verify, not LDAP). ACTIVE only.
const authPassword = async ctx => {
    const {username, password} = readBody(ctx)
    const user = username ? await repository.findByUsername(username) : null
    if (user && user.status === 'ACTIVE' && user.passwordHash && verifyPassword(password, user.passwordHash)) {
        await maybeRehashPassword(user, password)
        ctx.body = {status: 'success'}
    } else {
        ctx.status = 401
        ctx.body = {status: 'failure'}
    }
}

// GET /auth/authorized-keys?username= -> text/plain ssh_public_key. Backs the ssh-gateway
// AuthorizedKeysCommand (DB lookup, not sss_ssh_authorizedkeys). ACTIVE only; empty otherwise.
const authorizedKeys = async ctx => {
    const username = ctx.query.username
    const user = username ? await repository.findByUsername(username) : null
    ctx.type = 'text/plain'
    ctx.body = user && user.status === 'ACTIVE' && user.sshPublicKey ? user.sshPublicKey : ''
}

// GET /nss/snapshot -> {passwd, group, version}. Identity (ACTIVE + LOCKED), ids >= 10000. ETag-aware.
const nssSnapshot = async ctx => {
    const identities = await repository.listIdentities()
    const passwd = renderPasswd(identities)
    const group = renderGroup(identities)
    const version = snapshotVersion(passwd, group)
    ctx.set('ETag', version)
    if (ctx.headers['if-none-match'] === version) {
        ctx.status = 304
        return
    }
    ctx.body = {passwd, group, version}
}

export {
    acceptPrivacyPolicy,
    activate,
    associateGoogleAccount,
    authenticate,
    authorizedKeys,
    authPassword,
    changePassword,
    current,
    emailNotificationsEnabled,
    googleAccessRequestCallback,
    googleAccessRequestUrl,
    info,
    invite,
    list,
    lock,
    mostRecentLogin,
    mostRecentLoginByUser,
    nssSnapshot,
    refreshGoogleAccessToken,
    requestPasswordReset,
    resetPassword,
    revokeGoogleAccess,
    signup,
    unlock,
    updateCurrentDetails,
    updateDetails,
    updateGoogleProject,
    validateEmail,
    validateToken,
    validateUsername
}
