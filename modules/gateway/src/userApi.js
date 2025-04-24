const {map, catchError, of} = require('rxjs')
const modules = require('../config/modules')
const {postJson$, get$} = require('#sepal/httpClient')
const {SEPAL_USER_HEADER} = require('./user')
const {userTag} = require('./tag')

const log = require('#sepal/log').getLogger('userApi')

const CURRENT_USER_URL = `http://${modules.user}/current`
const REFRESH_GOOGLE_ACCESS_TOKEN_URL = `http://${modules.user}/google/refresh-access-token`
const REVOKE_GOOGLE_ACCESS_URL = `http://${modules.user}/google/revoke-access`

const getUser$ = username => {
    log.debug(`${userTag(username)} Reloading user`)
    return get$(CURRENT_USER_URL, {
        headers: {[SEPAL_USER_HEADER]: JSON.stringify({username})}
    }).pipe(
        map((({body}) => JSON.parse(body)))
    )
}

const refreshGoogleAccessToken$ = user => {
    log.debug(`${userTag(user.username)} Refreshing Google access token`)
    return postJson$(REFRESH_GOOGLE_ACCESS_TOKEN_URL, {
        headers: {
            [SEPAL_USER_HEADER]: JSON.stringify(user)
        }
    })
}

const revokeGoogleAccess$ = user => {
    log.warn(`${userTag(user?.username)} Revoking Google access token`)
    return postJson$(REVOKE_GOOGLE_ACCESS_URL, {
        headers: {
            [SEPAL_USER_HEADER]: JSON.stringify(user)
        }
    }).pipe(
        map(({body}) => JSON.parse(body)),
        map(({googleTokens: _googleTokens, ...user}) => user)
    )
}

const updateGoogleAccessToken$ = user => {
    log.debug(`${userTag(user.username)} Google access token refreshing...`)
    return refreshGoogleAccessToken$(user).pipe(
        map(({body: googleTokens, statusCode}) => {
            if (statusCode !== 204) {
                if (googleTokens) {
                    log.debug(`${userTag(user.username)} Google access token updated`, googleTokens)
                    return {...user, googleTokens: JSON.parse(googleTokens)}
                } else {
                    log.warn(`${userTag(user.username)} Google access token missing`)
                    return null
                }
            } else {
                log.info(`${userTag(user.username)} Google access token invalidated`)
                return null
            }
        }),
        catchError(error => {
            log.warn(`${userTag(user.username)} Google access token update failed:`, error)
            return of(null)
        })
    )
}

module.exports = {getUser$, revokeGoogleAccess$, updateGoogleAccessToken$}
