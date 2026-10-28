import {getLogger} from '#sepal/log'
import {storedUsername} from '#sepal/username'

import {hashPassword, needsRehash, verifyPassword} from './crypto.js'
import {sendInvite, sendPasswordReset} from './email.js'
import {publishUserLocked, publishUserUnlocked, publishUserUpdated} from './events.js'
import {LoginThrottle} from './loginThrottle.js'
import {renderGroup, renderPasswd, snapshotVersion} from './nss.js'
import {recaptcha} from './recaptcha.js'
import {generateToken, getOrGenerateToken, isExpired} from './tokens.js'
import {userToMap} from './user.js'
import {DuplicateUserError} from './userRepository.js'
import {isText, isValidEmail, isValidPassword, isValidUsername} from './validation.js'

const log = getLogger('userApi')

// What #applyDetails answers with when the body carries an email the database would reject, so its
// callers can tell that apart from an unknown user.
const INVALID_EMAIL = Symbol('invalid-email')

// What #applyDetails answers with when the body's email belongs to another user.
const EMAIL_TAKEN = Symbol('email-taken')

// What #applyDetails answers with when the body's revision is not the stored one — the caller edited
// a record that has since changed.
const CONFLICT = Symbol('conflict')

export class UserApi {
    #repository
    #googleService
    #googleOAuth
    #ensureProvisioned
    #loginThrottle

    constructor({repository, googleService, googleOAuth, ensureProvisioned, loginThrottle = new LoginThrottle()}) {
        this.#repository = repository
        this.#googleService = googleService
        this.#googleOAuth = googleOAuth
        this.#ensureProvisioned = ensureProvisioned
        this.#loginThrottle = loginThrottle
    }

    // clientIp is the address the caller saw the login come from.
    async authenticate(ctx) {
        const {username, password, clientIp} = readBody(ctx)
        if (!this.#loginThrottle.tryAttempt({username, clientIp})) {
            refuseThrottled(ctx)
            return
        }
        const user = isText(username) ? await this.#repository.findByUsername(username) : null
        if (await authenticates(user, password)) {
            this.#loginThrottle.succeeded({username, clientIp})
            await this.#repository.setLastLoginTime(user.username)
            await this.#maybeRehashPassword(user, password)
            try {
                await this.#googleService.refreshGoogleTokens(user.username, user.googleTokens)
            } catch (error) {
                log.warn(`Google token refresh failed for '${user.username}': ${error.message}`)
            }
            const refreshedUser = await this.#repository.findByUsername(user.username)
            log.info(`Authenticated '${user.username}'`)
            ctx.body = userToMap(refreshedUser)
        } else {
            ctx.status = 401
            ctx.body = {message: 'Invalid username or password'}
        }
    }

    // Answered from the database, never from the caller's copy of the user in the header.
    async current(ctx) {
        const user = await this.#repository.findByUsername(ctx.state.currentUser.username)
        if (!user) {
            ctx.status = 404
            ctx.body = {message: 'User not found'}
            return
        }
        ctx.body = userToMap(user)
    }

    async info(ctx) {
        const username = ctx.query.username
        const user = isText(username) ? await this.#repository.findByUsername(username) : null
        if (!user) {
            ctx.status = 404
            ctx.body = {message: 'User not found'}
            return
        }
        ctx.body = userToMap(user)
    }

    // Google tokens are left out of a listing.
    async list(ctx) {
        const users = await this.#repository.listUsers()
        ctx.body = users.map(user => userToMap(user, false))
    }

    async mostRecentLogin(ctx) {
        ctx.body = await this.#repository.mostRecentLogin(ctx.query.username)
    }

    async mostRecentLoginByUser(ctx) {
        ctx.body = await this.#repository.mostRecentLoginByUser()
    }

    async emailNotificationsEnabled(ctx) {
        const enabled = await this.#repository.emailNotificationsEnabled(ctx.params.email)
        ctx.body = {emailNotificationsEnabled: enabled}
    }

    async validateToken(ctx) {
        const token = readBody(ctx).token || ctx.query.token
        const user = isText(token) ? await this.#repository.findByToken(token) : null
        if (!user) {
            ctx.body = {status: 'failure', token: null, reason: 'invalid', message: 'Token is invalid'}
            return
        }
        const ageMs = Date.now() - (user.tokenGenerationTime || 0)
        if (ageMs > 24 * 60 * 60 * 1000) {
            ctx.body = {status: 'failure', token, reason: 'expired', message: 'Token is expired'}
            return
        }
        if (user.status === 'LOCKED') {
            ctx.body = {status: 'failure', token, reason: 'locked', message: 'Account locked'}
            return
        }
        // Unauthenticated: anyone holding the link sees this, so Google tokens stay out.
        ctx.body = {status: 'success', token, user: userToMap(user, false), message: 'Token is valid'}
    }

    // Deliberately publishes no event and sets no refresh header.
    async changePassword(ctx) {
        const {oldPassword, newPassword} = readBody(ctx)
        if (!isValidPassword(newPassword)) {
            ctx.status = 400
            ctx.body = {message: 'Invalid request'}
            return
        }
        const user = await this.#repository.findByUsername(ctx.state.currentUser.username)
        if (await verifies(user, oldPassword)) {
            await this.#repository.updatePassword(user.username, await hashPassword(newPassword))
            ctx.body = {status: 'success', message: 'Password changed'}
        } else {
            ctx.body = {status: 'failure', message: 'Invalid old password'}
        }
    }

    // The admin flag comes from the caller's current status, so a self-update cannot self-elevate.
    async updateCurrentDetails(ctx) {
        const current = ctx.state.currentUser
        if (!(await this.#confirmsEmailChange(ctx, current.username))) {
            ctx.status = 403
            ctx.body = {message: 'Invalid password'}
            return
        }
        const user = await this.#applyDetails(ctx, {targetUsername: current.username, adminValue: !!current.admin})
        if (user === INVALID_EMAIL) {
            ctx.status = 400
            ctx.body = {message: 'Invalid email'}
            return
        }
        if (user === EMAIL_TAKEN) {
            ctx.status = 400
            ctx.body = {message: 'Email already in use'}
            return
        }
        if (user === CONFLICT) {
            return this.#rejectConflict(ctx, current.username, true)
        }
        if (!user) {
            ctx.status = 404
            ctx.body = {message: 'User not found'}
            return
        }
        ctx.body = userToMap(user)
    }

    // An administrator's update takes the admin flag from the body; the answer omits google tokens.
    async updateDetails(ctx) {
        const body = readBody(ctx)
        const user = await this.#applyDetails(ctx, {
            targetUsername: body.username,
            adminValue: body.admin === true || body.admin === 'true'
        })
        if (user === INVALID_EMAIL) {
            ctx.status = 400
            ctx.body = {message: 'Invalid email'}
            return
        }
        if (user === EMAIL_TAKEN) {
            ctx.status = 400
            ctx.body = {message: 'Email already in use'}
            return
        }
        if (user === CONFLICT) {
            return this.#rejectConflict(ctx, body.username, false)
        }
        if (!user) {
            ctx.status = 404
            ctx.body = {message: 'User not found'}
            return
        }
        ctx.body = userToMap(user, false)
    }

    // Sets the refresh header; deliberately publishes no event.
    async acceptPrivacyPolicy(ctx) {
        const username = ctx.state.currentUser.username
        await this.#repository.acceptPrivacyPolicy(username)
        ctx.set('sepal-user-updated', username)
        ctx.status = 204
    }

    // Idempotent: an already-locked user is returned unchanged.
    async lock(ctx) {
        const username = suppliedUsername(ctx)
        if (username === storedUsername(ctx.state.currentUser.username)) {
            ctx.status = 400
            ctx.body = {message: 'Cannot lock your own account'}
            return
        }
        const user = username ? await this.#repository.findByUsername(username) : null
        if (!user) {
            ctx.status = 404
            ctx.body = {message: 'User not found'}
            return
        }
        if (user.status !== 'LOCKED') {
            await this.#repository.updateStatus(username, 'LOCKED')
            const lockedUser = await this.#repository.findByUsername(username)
            publishUserLocked(lockedUser)
            ctx.set('sepal-user-updated', username)
            ctx.body = userToMap(lockedUser)
        } else {
            ctx.body = userToMap(user)
        }
    }

    // Idempotent: an already-unlocked user is returned unchanged. No UserUpdated event; the refresh
    // header is set only when the unlock actually changed something. Watching admin browsers still
    // learn of it through userChanged$.
    async unlock(ctx) {
        const username = suppliedUsername(ctx)
        const user = username ? await this.#repository.findByUsername(username) : null
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
        await this.#repository.updateStatus(username, 'PENDING')
        await this.#repository.updateToken(username, token)
        const unlockedUser = await this.#repository.findByUsername(username)
        sendPasswordReset(unlockedUser, token)
        publishUserUnlocked(unlockedUser)
        ctx.set('sepal-user-updated', username)
        ctx.body = userToMap(unlockedUser)
    }

    // A reset token expires, and a LOCKED user cannot reset their way back in.
    async resetPassword(ctx) {
        const {token, password, recaptchaToken} = readBody(ctx)
        if (!(await recaptcha.isValid(recaptchaToken, 'RESET_PASSWORD'))) {
            ctx.status = 400
            ctx.body = {message: 'Invalid request'}
            return
        }
        if (!isValidPassword(password)) {
            ctx.status = 400
            ctx.body = {message: 'Invalid request'}
            return
        }
        const user = isText(token) ? await this.#repository.findByToken(token) : null
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
        const wasPending = user.status === 'PENDING'
        await this.#repository.updatePassword(user.username, await hashPassword(password))
        await this.#repository.updateStatus(user.username, 'ACTIVE')
        // Leaving PENDING (covers unlock: LOCKED -> PENDING -> reset link) must guarantee complete
        // provisioning; a keyless user is healed too. Routine resets of provisioned users skip it —
        // provision recursively chowns the data home, too expensive for a request that needs neither.
        const reloaded = await this.#repository.findByUsername(user.username)
        const updated = wasPending || !reloaded.sshPublicKey
            ? await this.#ensureProvisioned(reloaded)
            : reloaded
        publishUserUpdated(updated)
        ctx.body = userToMap(updated)
    }

    async validateUsername(ctx) {
        const {username, recaptchaToken} = readBody(ctx)
        const lowered = isText(username) ? username.toLowerCase() : ''
        const valid = await recaptcha.isValid(recaptchaToken, 'VALIDATE_USERNAME')
            && isValidUsername(lowered)
            && !(await this.#repository.findByUsername(lowered))
        ctx.body = {valid: Boolean(valid)}
    }

    async validateEmail(ctx) {
        const {email, recaptchaToken} = readBody(ctx)
        const valid = await recaptcha.isValid(recaptchaToken, 'VALIDATE_EMAIL')
            && isValidEmail(email)
            && !(await this.#repository.findByEmail(email))
        ctx.body = {valid: Boolean(valid)}
    }

    async signup(ctx) {
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
        try {
            await this.#createInvitedUser({username, name, email, organization, intendedUse: null})
        } catch (error) {
            if (!(error instanceof DuplicateUserError)) {
                throw error
            }
            ctx.status = 400
            ctx.body = {message: 'Username or email already in use'}
            return
        }
        ctx.body = {status: 'success', message: 'Signup succeeded'}
    }

    // Always answers the same way, whether or not the address is one we know: the response must not
    // tell an anonymous caller which addresses have accounts.
    async requestPasswordReset(ctx) {
        const {email, recaptchaToken} = readBody(ctx)
        ctx.body = {
            status: 'success',
            message: 'If there is an account with this email, an email with a password reset link will be sent there'
        }
        if (!(await recaptcha.isValid(recaptchaToken, 'REQUEST_PASSWORD_RESET'))) {
            log.info(`Ignoring password reset request with invalid reCAPTCHA for email: ${email}`)
            return
        }
        const user = isText(email) ? await this.#repository.findByEmail(email) : null
        if (!user) {
            log.info(`Cannot reset password for non-existing email: ${email}`)
            return
        }
        if (user.status === 'LOCKED') {
            log.info(`Ignoring password reset request for locked user: ${user.username}`)
            return
        }
        // An outstanding link is resent as it is: restarting its clock would let anyone who has seen it
        // once keep it alive indefinitely.
        const token = getOrGenerateToken(user)
        if (token !== user.token) {
            await this.#repository.updateToken(user.username, token)
        }
        log.info(`Sending password reset email to '${user.username}'`)
        sendPasswordReset(user, token)
    }

    async googleAccessRequestUrl(ctx) {
        const {username} = ctx.state.currentUser
        ctx.body = {url: this.#googleOAuth.redirectUrl(username, ctx.query.destinationUrl)}
    }

    // A meta-refresh rather than a redirect, so Google's querystring survives the hop intact.
    async googleAccessRequestCallback(ctx) {
        const url = `/api/user/google/associate-account?${ctx.querystring}`
        ctx.type = 'text/html'
        ctx.body = `<html><head><meta http-equiv="refresh" content="0;URL='${url}'"/></head></html>`
    }

    async associateGoogleAccount(ctx) {
        const {username} = ctx.state.currentUser
        const destination = this.#googleOAuth.destinationPath(username, ctx.query.state)
        if (!destination) {
            ctx.status = 400
            ctx.body = {message: 'Invalid state'}
            return
        }
        const tokens = await this.#googleOAuth.requestTokens(ctx.query.code)
        await this.#googleService.saveTokens(username, tokens)
        ctx.set('sepal-user-updated', username)
        ctx.redirect(destination)
    }

    // No tokens are passed: refreshGoogleTokens loads the user's stored ones itself.
    async refreshGoogleAccessToken(ctx) {
        const {username} = ctx.state.currentUser
        const tokens = await this.#googleService.refreshGoogleTokens(username)
        ctx.set('sepal-user-updated', username)
        if (tokens) {
            ctx.body = tokens
        } else {
            ctx.status = 204
        }
    }

    async revokeGoogleAccess(ctx) {
        const {username} = ctx.state.currentUser
        const user = await this.#repository.findByUsername(username)
        if (user.googleTokens) {
            try {
                await this.#googleOAuth.revokeTokens(user.googleTokens)
            } catch (error) {
                log.info(`Failed to revoke Google tokens for '${username}': ${error.message}`)
            }
        }
        const updated = await this.#googleService.saveTokens(username, null)
        ctx.set('sepal-user-updated', username)
        ctx.body = userToMap(updated)
    }

    async updateGoogleProject(ctx) {
        const {username} = ctx.state.currentUser
        const user = await this.#repository.findByUsername(username)
        if (user.googleTokens) {
            const legacyProject = ctx.query.legacyProject === 'true'
            const tokens = {
                ...user.googleTokens,
                projectId: legacyProject ? null : (ctx.query.projectId ?? null),
                legacyProject
            }
            await this.#googleService.saveTokens(username, tokens)
            ctx.set('sepal-user-updated', username)
        }
        ctx.status = 204
    }

    // Backs the ssh-gateway's PAM module, which verifies against this database rather than LDAP.
    // ACTIVE users only.
    async authPassword(ctx) {
        const {username, password, clientIp} = readBody(ctx)
        if (!this.#loginThrottle.tryAttempt({username, clientIp})) {
            refuseThrottled(ctx)
            return
        }
        const user = isText(username) ? await this.#repository.findByUsername(username) : null
        if (await authenticates(user, password)) {
            this.#loginThrottle.succeeded({username, clientIp})
            await this.#maybeRehashPassword(user, password)
            ctx.body = {status: 'success'}
        } else {
            ctx.status = 401
            ctx.body = {status: 'failure'}
        }
    }

    // ETag-aware: the sync agent skips the rewrite when the snapshot has not changed.
    async nssSnapshot(ctx) {
        const identities = await this.#repository.listIdentities()
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

    // After a successful password verification, transparently upgrade a legacy/weaker
    // hash (e.g. migrated {SSHA}) to the current {SCRYPT} scheme. Never break login on
    // failure, so errors are logged and swallowed.
    async #maybeRehashPassword(user, password) {
        if (needsRehash(user.passwordHash)) {
            try {
                await this.#repository.updatePassword(user.username, await hashPassword(password))
                log.info(`Upgraded password hash for '${user.username}'`)
            } catch (error) {
                log.warn(`Password hash upgrade failed for '${user.username}': ${error.message}`)
            }
        }
    }

    // Whoever controls the address can reset the password, so changing it takes the password too. An
    // unknown user passes, to be answered as such by #applyDetails.
    async #confirmsEmailChange(ctx, username) {
        const {email, password} = readBody(ctx)
        const user = await this.#repository.findByUsername(username)
        return !user || email === user.email || await verifies(user, password)
    }

    // Shared detail-update core. adminValue forces the admin flag (self-update cannot self-elevate).
    // Returns the reloaded user, null when the request names no existing user, INVALID_EMAIL when
    // the body carries an email the database would reject (malformed, or over EMAIL_MAX_LENGTH),
    // EMAIL_TAKEN when another user has that email, or CONFLICT when the body's revision is not the
    // stored one. Both callers funnel through here, so neither can skip the checks.
    async #applyDetails(ctx, {targetUsername, adminValue}) {
        if (!isText(targetUsername)) {
            return null
        }
        const body = readBody(ctx)
        if (body.email != null && !isValidEmail(body.email)) {
            return INVALID_EMAIL
        }
        const updated = await this.#repository.updateUserDetails({
            username: targetUsername,
            name: body.name,
            email: body.email,
            organization: body.organization,
            intendedUse: body.intendedUse,
            emailNotificationsEnabled: body.emailNotificationsEnabled === true || body.emailNotificationsEnabled === 'true',
            manualMapRenderingEnabled: body.manualMapRenderingEnabled === true || body.manualMapRenderingEnabled === 'true',
            admin: adminValue,
            revision: toRevision(body.revision)
        }).catch(error => error instanceof DuplicateUserError ? EMAIL_TAKEN : Promise.reject(error))
        if (updated === EMAIL_TAKEN) {
            return EMAIL_TAKEN
        }
        const user = await this.#repository.findByUsername(targetUsername)
        if (!user) {
            return null
        }
        if (!updated) {
            return CONFLICT
        }
        publishUserUpdated(user)
        ctx.set('sepal-user-updated', targetUsername)
        return user
    }

    // 409 with the record as it is now, so the caller can show it and retry from it.
    async #rejectConflict(ctx, username, withGoogleTokens) {
        const user = await this.#repository.findByUsername(username)
        ctx.status = 409
        ctx.body = {message: 'User was updated by someone else', user: userToMap(user, withGoogleTokens)}
    }

    // Create a PENDING user, send the invitation email, and publish UserUpdated. Returns the reloaded
    // user. No filesystem/SSH provisioning here: that happens lazily when the user leaves PENDING
    // (password reset), so users who never activate cost no filesystem resources. New users
    // get uid = gid = id (set by insertUser); collision-free against migrated LDAP ids.
    async #createInvitedUser({username, name, email, organization, intendedUse}) {
        const lowered = (username || '').toLowerCase()
        const token = generateToken()
        await this.#repository.insertUser({username: lowered, name, email, organization, intendedUse, token})
        const user = await this.#repository.findByUsername(lowered)
        sendInvite(user, token)
        publishUserUpdated(user)
        return user
    }
}

const readBody = ctx => ctx.request.body || {}

const toRevision = revision =>
    revision == null || revision === '' ? null : Number(revision)

// Both admin endpoints take the name from the body or the query, in that order, and normalize it to
// the spelling the database stores. Null when nothing usable was supplied, so no lookup is attempted.
const suppliedUsername = ctx => {
    const supplied = readBody(ctx).username || ctx.query.username
    return isText(supplied) ? storedUsername(supplied) : null
}

// Only a string can be verified: a hash is compared over the password's bytes, and Buffer.from turns
// a value of any other type into bytes of its own rather than refusing it.
const verifies = async (user, password) =>
    Boolean(user?.passwordHash) && isText(password) && await verifyPassword(password, user.passwordHash)

const refuseThrottled = ctx => {
    ctx.status = 429
    ctx.body = {message: 'Too many failed logins, try again later'}
}

// What both password endpoints mean by a successful login.
const authenticates = async (user, password) =>
    user?.status === 'ACTIVE' && await verifies(user, password)

// The username is validated lowercased, because that is the spelling insertUser will store.
const isValidNewUser = ({username, name, email}) =>
    isText(username) && isValidUsername(username.toLowerCase()) && Boolean(name) && isValidEmail(email)
