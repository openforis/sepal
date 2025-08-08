const {map, catchError, tap, switchMap, of} = require('rxjs')
const modules = require('../config/modules')
const {postJson$, get$} = require('#sepal/httpClient')
const {SEPAL_USER_HEADER} = require('./user')
const {userTag} = require('./tag')
const {formatDistanceStrict} = require('date-fns/formatDistanceStrict')

const log = require('#sepal/log').getLogger('userApi')

const CURRENT_USER_URL = `http://${modules.user}/current`
const REFRESH_GOOGLE_ACCESS_TOKEN_URL = `http://${modules.user}/google/refresh-access-token`
const REVOKE_GOOGLE_ACCESS_URL = `http://${modules.user}/google/revoke-access`

const loadUser$ = username => {
    log.trace(`${userTag(username)} Loading user...`)
    return get$(CURRENT_USER_URL, {
        headers: {[SEPAL_USER_HEADER]: JSON.stringify({username})}
    }).pipe(
        map((({body}) => JSON.parse(body))),
        tap(() => log.debug(`${userTag(username)} Loaded user`))
    )
}

const refreshGoogleAccessToken$ = ({username, googleTokens}) => {
    log.trace(`${userTag(username)} Refreshing Google access token...`)
    return postJson$(REFRESH_GOOGLE_ACCESS_TOKEN_URL, {
        headers: {
            [SEPAL_USER_HEADER]: JSON.stringify({username, googleTokens})
        }
    }).pipe(
        map(({body, statusCode}) => ({googleTokens: body && JSON.parse(body), statusCode})),
        tap(() => log.debug(`${userTag(username)} Refreshed Google access token`))
    )
}

const revokeGoogleAccess$ = ({username, googleTokens}) => {
    log.debug(`${userTag(username)} Revoking Google access token...`)
    return postJson$(REVOKE_GOOGLE_ACCESS_URL, {
        headers: {
            [SEPAL_USER_HEADER]: JSON.stringify({username, googleTokens})
        }
    }).pipe(
        map(({body}) => JSON.parse(body)),
        map(({googleTokens: _googleTokens, ...user}) => user),
        tap(user => log.info(`${userTag(user?.username)} Revoked Google access token`))
    )
}

const updateGoogleAccessToken$ = user => {
    log.debug(`${userTag(user.username)} Google access token refreshing...`)
    return refreshGoogleAccessToken$(user).pipe(
        switchMap(({googleTokens, statusCode}) => {
            if (statusCode !== 204) {
                const expiration = formatDistanceStrict(googleTokens.accessTokenExpiryDate, Date.now(), {addSuffix: true})
                log.info(`${userTag(user.username)} Google access token updated, expiring ${expiration}`)
                return of({...user, googleTokens})
            } else {
                log.info(`${userTag(user.username)} Google access token invalidated`)
                return revokeGoogleAccess$(user)
            }
        }),
        catchError(error => {
            throw new Error(`${userTag(user.username)} Google access token update failed:`, {cause: error})
        })
    )
}

module.exports = {loadUser$, revokeGoogleAccess$, updateGoogleAccessToken$}
