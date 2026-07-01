import {getLogger} from '#sepal/log'

import {saveCredentials as defaultSaveCredentials} from './credentials.js'
import {publishUserUpdated as defaultPublishUserUpdated} from './events.js'
import {googleOAuth, InvalidTokenError, shouldBeRefreshed as defaultShouldBeRefreshed} from './googleOAuth.js'
import * as repository from './userRepository.js'

const log = getLogger('googleService')

const createGoogleService = ({
    findByUsername, updateGoogleTokens, saveCredentials,
    refreshAccessToken, shouldBeRefreshed, publishUserUpdated
}) => {
    // Persist tokens (DB + credentials file), reload, publish UserUpdated. A null `tokens` clears them.
    // The credentials-file write is best-effort: Java wrote it asynchronously via a retry queue, so a
    // failure there never failed the request. We mirror that — log and continue (the DB is the source
    // of truth; the gee module also reads tokens off the user, not only the file).
    const saveTokens = async (username, tokens) => {
        await updateGoogleTokens(username, tokens)
        try {
            await saveCredentials(username, tokens)     // saveCredentials(null) deletes the file
        } catch (error) {
            log.warn(`Failed to write EE credentials file for '${username}': ${error.message}`)
        }
        const user = await findByUsername(username)
        publishUserUpdated(user)
        return user
    }

    // Refresh if the access token expires within 10 minutes; on invalid_grant/invalid_token clear it.
    // Returns the (possibly refreshed) tokens, the unchanged tokens, or null.
    const refreshGoogleTokens = async (username, passedTokens) => {
        const tokens = passedTokens ?? (await findByUsername(username)).googleTokens
        if (!tokens) {
            return null
        }
        if (!shouldBeRefreshed(tokens)) {
            return tokens
        }
        let refreshed
        try {
            refreshed = await refreshAccessToken(tokens)
        } catch (error) {
            if (error instanceof InvalidTokenError) {
                log.info(`Invalid Google refresh token for '${username}'; clearing stored credentials`)
                refreshed = null
            } else {
                throw error
            }
        }
        await saveTokens(username, refreshed)
        return refreshed
    }

    return {refreshGoogleTokens, saveTokens}
}

const googleService = createGoogleService({
    findByUsername: repository.findByUsername,
    updateGoogleTokens: repository.updateGoogleTokens,
    saveCredentials: defaultSaveCredentials,
    refreshAccessToken: tokens => googleOAuth.refreshAccessToken(tokens),
    shouldBeRefreshed: defaultShouldBeRefreshed,
    publishUserUpdated: defaultPublishUserUpdated
})

export {createGoogleService, googleService}
