import {getLogger} from '#sepal/log'

import {InvalidTokenError} from './googleOAuth.js'

const log = getLogger('googleService')

export class GoogleService {
    #repository
    #googleOAuth
    #saveCredentials
    #publishUserUpdated
    #clock

    constructor({repository, googleOAuth, saveCredentials, publishUserUpdated, clock}) {
        this.#repository = repository
        this.#googleOAuth = googleOAuth
        this.#saveCredentials = saveCredentials
        this.#publishUserUpdated = publishUserUpdated
        this.#clock = clock
    }

    // The credentials file is best-effort: the database is the source of truth, and the gee module
    // reads tokens off the user as well as off the file, so a file that cannot be written must not
    // fail the request.
    async saveTokens(username, tokens) {
        await this.#repository.updateGoogleTokens(username, tokens)
        try {
            await this.#saveCredentials(username, tokens)     // saveCredentials(null) deletes the file
        } catch (error) {
            log.warn(`Failed to write EE credentials file for '${username}': ${error.message}`)
        }
        const user = await this.#repository.findByUsername(username)
        this.#publishUserUpdated(user)
        return user
    }

    // A token Google has rejected is cleared rather than kept: it would fail on every attempt.
    async refreshGoogleTokens(username, passedTokens) {
        const tokens = passedTokens ?? (await this.#repository.findByUsername(username)).googleTokens
        if (!tokens) {
            return null
        }
        if (!dueForRefresh(tokens, this.#clock())) {
            return tokens
        }
        let refreshed
        try {
            refreshed = await this.#googleOAuth.refreshAccessToken(tokens)
        } catch (error) {
            if (error instanceof InvalidTokenError) {
                log.info(`Invalid Google refresh token for '${username}'; clearing stored credentials`)
                refreshed = null
            } else {
                throw error
            }
        }
        await this.saveTokens(username, refreshed)
        return refreshed
    }
}

// Ten minutes before expiry, that boundary included.
const REFRESH_IF_EXPIRES_IN_MS = 10 * 60 * 1000

const dueForRefresh = (tokens, now) =>
    (tokens.accessTokenExpiryDate - now.getTime()) <= REFRESH_IF_EXPIRES_IN_MS
