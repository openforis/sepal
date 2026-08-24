// Loads all PENDING+ACTIVE sessions, dedupes usernames (refresh once per user), and asks the
// Google OAuth gateway to refresh each user's access token. A PER-USER try/catch keeps one
// user's failure (no refresh token, user-module hiccup) from stopping the rest.

import {getLogger} from '#sepal/log'

import {userTag} from '../../tag.js'
import {State} from '../workerSession.js'

const log = getLogger('worker/refreshGoogleTokens')

const refreshGoogleTokens = async ({repo, googleOAuthGateway}) => {
    const sessions = await repo.sessions([State.PENDING, State.ACTIVE])
    const usernames = [...new Set(sessions.map(session => session.username))]
    for (const username of usernames) {
        try {
            await googleOAuthGateway.refreshTokens(username)
        } catch (error) {
            log.error(`Failed to refresh Google tokens for ${userTag(username)}`, error)
        }
    }
    return null
}

export {refreshGoogleTokens}
