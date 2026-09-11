import {getLogger} from '#sepal/log'
import {storedUsername} from '#sepal/username'

import {hashPassword, needsRehash, verifyPassword} from './crypto.js'
import {sendInvite, sendPasswordReset} from './email.js'
import {publishUserLocked, publishUserUpdated} from './events.js'
import {renderGroup, renderPasswd, snapshotVersion} from './nss.js'
import {recaptcha} from './recaptcha.js'
import {generateToken, getOrGenerateToken, isExpired} from './tokens.js'
import {userToMap} from './user.js'
import {isValidEmail, isValidUsername} from './validation.js'

const log = getLogger('userApi')

export class UserApi {
    #repository
    #googleService
    #googleOAuth
    #ensureProvisioned

    constructor({repository, googleService, googleOAuth, ensureProvisioned}) {
        this.#repository = repository
        this.#googleService = googleService
        this.#googleOAuth = googleOAuth
        this.#ensureProvisioned = ensureProvisioned
    }

    async authenticate(ctx) {
        const {username, password} = readBody(ctx)
        const user = username ? await this.#repository.findByUsername(username) : null
        if (user && user.status === 'ACTIVE' && user.passwordHash && verifyPassword(password, user.passwordHash)) {
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
        const user = username ? await this.#repository.findByUsername(username) : null
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
        const user = token ? await this.#repository.findByToken(token) : null
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

    // Deliberately publishes no event and sets no refresh header.
    async changePassword(ctx) {
        const {oldPassword, newPassword} = readBody(ctx)
        const user = await this.#repository.findByUsername(ctx.state.currentUser.username)
        if (user && user.passwordHash && verifyPassword(oldPassword, user.passwordHash)) {
            await this.#repository.updatePassword(user.username, hashPassword(newPassword))
            ctx.body = {status: 'success', message: 'Password changed'}
        } else {
            ctx.body = {status: 'failure', message: 'Invalid old password'}
        }
    }

    // The admin flag comes from the caller's current status, so a self-update cannot self-elevate.
    async updateCurrentDetails(ctx) {
        const current = ctx.state.currentUser
        const user = await this.#applyDetails(ctx, {targetUsername: current.username, adminValue: !!current.admin})
        if (user === INVALID_EMAIL) {
            ctx.status = 400
            ctx.body = {message: 'Invalid email'}
            return
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
        const username = storedUsername(readBody(ctx).username || ctx.query.username || '')
        const user = await this.#repository.findByUsername(username)
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
    // header is set only when the unlock actually changed something.
    async unlock(ctx) {
        const username = storedUsername(readBody(ctx).username || ctx.query.username || '')
        const user = await this.#repository.findByUsername(username)
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
        ctx.set('sepal-user-updated', username)
        ctx.body = userToMap(unlockedUser)
    }

    // An activation token never expires: the invitation may sit in an inbox for weeks, and the token
    // is single-use anyway. A password reset token does expire — see resetPassword.
    async activate(ctx) {
        const {token, password} = readBody(ctx)
        if (!password || password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
            ctx.status = 400
            ctx.body = {message: 'Invalid request'}
            return
        }
        const user = token ? await this.#repository.findByToken(token) : null
        if (!user) {
            ctx.status = 400
            ctx.body = {message: 'Invalid token'}
            return
        }
        await this.#repository.updatePassword(user.username, hashPassword(password))
        await this.#repository.updateStatus(user.username, 'ACTIVE')
        await this.#repository.invalidateToken(token)
        // Leaving PENDING: guarantee complete provisioning (home dir, data home, keypair) — it is
        // skipped at invite/signup so never-activated users cost no filesystem resources.
        const activated = await this.#ensureProvisioned(await this.#repository.findByUsername(user.username))
        publishUserUpdated(activated)
        ctx.body = userToMap(activated)
    }

    // Unlike activation, a reset token expires, and a LOCKED user cannot reset their way back in.
    async resetPassword(ctx) {
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
        const user = token ? await this.#repository.findByToken(token) : null
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
        await this.#repository.updatePassword(user.username, hashPassword(password))
        await this.#repository.updateStatus(user.username, 'ACTIVE')
        await this.#repository.invalidateToken(token)
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
        const lowered = (username || '').toLowerCase()
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
        await this.#createInvitedUser({username, name, email, organization, intendedUse: null})
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
        const user = await this.#repository.findByEmail(email)
        if (!user) {
            log.info(`Cannot reset password for non-existing email: ${email}`)
            return
        }
        if (user.status === 'LOCKED') {
            log.info(`Ignoring password reset request for locked user: ${user.username}`)
            return
        }
        const token = getOrGenerateToken(user)
        await this.#repository.updateToken(user.username, token)
        log.info(`Sending password reset email to '${user.username}'`)
        sendPasswordReset(user, token)
    }

    async googleAccessRequestUrl(ctx) {
        ctx.body = {url: this.#googleOAuth.redirectUrl(ctx.query.destinationUrl)}
    }

    // A meta-refresh rather than a redirect, so Google's querystring survives the hop intact.
    async googleAccessRequestCallback(ctx) {
        const url = `/api/user/google/associate-account?${ctx.querystring}`
        ctx.type = 'text/html'
        ctx.body = `<html><head><meta http-equiv="refresh" content="0;URL='${url}'"/></head></html>`
    }

    async associateGoogleAccount(ctx) {
        const {username} = ctx.state.currentUser
        const tokens = await this.#googleOAuth.requestTokens(ctx.query.code)
        await this.#googleService.saveTokens(username, tokens)
        ctx.set('sepal-user-updated', username)
        ctx.redirect(ctx.query.state)
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
        const {username, password} = readBody(ctx)
        const user = username ? await this.#repository.findByUsername(username) : null
        if (user && user.status === 'ACTIVE' && user.passwordHash && verifyPassword(password, user.passwordHash)) {
            await this.#maybeRehashPassword(user, password)
            ctx.body = {status: 'success'}
        } else {
            ctx.status = 401
            ctx.body = {status: 'failure'}
        }
    }

    // Backs the ssh-gateway's AuthorizedKeysCommand, which reads this database rather than
    // sss_ssh_authorizedkeys. An inactive user gets an empty body, never an error.
    async authorizedKeys(ctx) {
        const username = ctx.query.username
        const user = username ? await this.#repository.findByUsername(username) : null
        ctx.type = 'text/plain'
        ctx.body = user && user.status === 'ACTIVE' && user.sshPublicKey ? user.sshPublicKey : ''
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
                await this.#repository.updatePassword(user.username, hashPassword(password))
                log.info(`Upgraded password hash for '${user.username}'`)
            } catch (error) {
                log.warn(`Password hash upgrade failed for '${user.username}': ${error.message}`)
            }
        }
    }

    // Shared detail-update core. adminValue forces the admin flag (self-update cannot self-elevate).
    // Returns the reloaded user, null when the user does not exist, or INVALID_EMAIL when the body
    // carries an email the database would reject (malformed, or over EMAIL_MAX_LENGTH). Both callers
    // funnel through here, so neither can skip the check.
    async #applyDetails(ctx, {targetUsername, adminValue}) {
        const body = readBody(ctx)
        if (body.email != null && !isValidEmail(body.email)) {
            return INVALID_EMAIL
        }
        await this.#repository.updateUserDetails({
            username: targetUsername,
            name: body.name,
            email: body.email,
            organization: body.organization,
            intendedUse: body.intendedUse,
            emailNotificationsEnabled: body.emailNotificationsEnabled === true || body.emailNotificationsEnabled === 'true',
            manualMapRenderingEnabled: body.manualMapRenderingEnabled === true || body.manualMapRenderingEnabled === 'true',
            admin: adminValue
        })
        const user = await this.#repository.findByUsername(targetUsername)
        if (!user) {
            return null
        }
        publishUserUpdated(user)
        ctx.set('sepal-user-updated', targetUsername)
        return user
    }

    // Create a PENDING user, send the invitation email, and publish UserUpdated. Returns the reloaded
    // user. No filesystem/SSH provisioning here: that happens lazily when the user leaves PENDING
    // (activate / password reset), so users who never activate cost no filesystem resources. New users
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

// The username is validated lowercased, because that is the spelling insertUser will store.
const isValidNewUser = ({username, name, email}) =>
    isValidUsername((username || '').toLowerCase()) && Boolean(name) && isValidEmail(email)

// What #applyDetails answers with when the body carries an email the database would reject, so its
// callers can tell that apart from an unknown user.
const INVALID_EMAIL = Symbol('invalid-email')

const PASSWORD_MIN_LENGTH = 12

const PASSWORD_MAX_LENGTH = 100
