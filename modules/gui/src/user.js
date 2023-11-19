import {catchError, map, of, switchMap, tap} from 'rxjs'
import {msg} from 'translate'
import {publishCurrentUserEvent, publishEvent} from 'eventPublisher'
import {select} from 'store'
import Notifications from 'widget/notifications'
import actionBuilder from 'action-builder'
import api from 'api'

export const currentUser = () => select('user.currentUser')
export const invalidCredentials = () => select('user.login.invalidCredentials')
export const tokenUser = () => select('user.tokenUser')
export const isGoogleAccount = () => !!(currentUser()?.googleTokens)
export const isServiceAccount = () => !isGoogleAccount()
export const googleProjectId = () => currentUser()?.googleTokens?.projectId

export const loadUser$ = () =>
    api.user.loadCurrentUser$().pipe(
        catchError(() => {
            Notifications.error({message: msg('landing.loadCurrentUser.error')})
            return of(null)
        }),
        tap(user => updateUser(user))
    )

export const login$ = ({username, password}) => {
    resetInvalidCredentials()
    return api.user.login$({username, password}).pipe(
        tap(user => {
            publishEvent(user ? 'login' : 'login_failed')
            publishCurrentUserEvent(user)
        })
    )
}

export const logout$ = () =>
    api.user.logout$().pipe(
        tap(() => document.location = '/' /* force full state reset*/)
    )

export const resetPassword$ = ({token, username, password, type, recaptchaToken}) => {
    return api.user.resetPassword$({token, password, recaptchaToken}).pipe(
        tap(() =>
            publishEvent(type === 'reset' ? 'password_reset' : 'user_activated')
        ),
        switchMap(() =>
            login$({username, password})
        )
    )
}

export const updateUser = user => {
    publishCurrentUserEvent(user)
    actionBuilder('SET_CURRENT_USER', {user})
        .set('user', {
            currentUser: user,
            initialized: true,
            loggedOn: !!user
        })
        .dispatch()
}

export const resetInvalidCredentials = () =>
    actionBuilder('RESET_INVALID_CREDENTIALS')
        .del('user.login.invalidCredentials')
        .dispatch()

export const revokeGoogleAccess$ = () =>
    api.user.revokeGoogleAccess$().pipe(
        tap(() => publishEvent('revoked_google_access')),
        switchMap(() => loadUser$())
    )

export const requestUserAccess$ = () =>
    api.user.getGoogleAccessRequestUrl$(window.location).pipe(
        tap(() => publishEvent('requested_google_access')),
        tap(({url}) => window.location = url)
    )

export const requestPasswordReset$ = ({email, optional}, recaptchaToken) =>
    api.user.requestPasswordReset$({email, optional, recaptchaToken}).pipe(
        tap(() => publishEvent('requested_password_reset')),
    )

export const validateToken$ = token =>
    api.user.validateToken$(token).pipe(
        map(({user}) => {
            if (user) {
                return user
            } else {
                throw Error('Invalid token')
            }
        })
    )

export const signUp$ = (userDetails, recaptchaToken) =>
    api.user.signUp$(userDetails, recaptchaToken)

export const validateUsername$ = ({username, recaptchaToken}) =>
    api.user.validateUsername$({username, recaptchaToken}).pipe(
        map(({valid}) => valid)
    )
    
export const validateEmail$ = ({email, recaptchaToken}) =>
    api.user.validateEmail$({email, recaptchaToken}).pipe(
        map(({valid}) => valid)
    )

export const updateCurrentUserDetails$ = ({name, email, organization, intendedUse, emailNotificationsEnabled}) =>
    api.user.updateCurrentUserDetails$({name, email, organization, intendedUse, emailNotificationsEnabled}).pipe(
        tap(({name, email, organization}) =>
            actionBuilder('UPDATE_USER_DETAILS', {name, email, organization, intendedUse})
                .set('user.currentUser.name', name)
                .set('user.currentUser.email', email)
                .set('user.currentUser.organization', organization)
                .set('user.currentUser.intendedUse', intendedUse)
                .set('user.currentUser.emailNotificationsEnabled', emailNotificationsEnabled)
                .dispatch()
        )
    )

export const changeCurrentUserPassword$ = ({oldPassword, newPassword}) =>
    api.user.changePassword$({oldPassword, newPassword})

export const updateCurrentUserSession$ = session =>
    api.user.updateCurrentUserSession$(session).pipe(
        tap(() =>
            actionBuilder('UPDATE_USER_SESSION_POSTED', {session})
                .assign(['user.currentUserReport.sessions', {id: session.id}], {
                    earliestTimeoutHours: session.keepAlive
                })
                .dispatch()
        )
    )

export const stopCurrentUserSession$ = session =>
    api.user.stopCurrentUserSession$(session).pipe(
        tap(() =>
            actionBuilder('STOP_USER_SESSION_POSTED', {session})
                .del(['user.currentUserReport.sessions', {id: session.id}])
                .dispatch()
        )
    )

export const credentialsPosted = user =>
    actionBuilder('CREDENTIALS_POSTED')
        .set('user.currentUser', user)
        .set('user.login.invalidCredentials', !user)
        .set('user.loggedOn', !!user)
        .dispatch()

export const updateGoogleProject$ = projectId =>
    api.user.updateGoogleProject$(projectId, !projectId).pipe(
        tap(() =>
            actionBuilder('UPDATE_GOOGLE_PROJECT')
                .set('user.currentUser.googleTokens.projectId', projectId)
                .dispatch()
        )
    )

export const projects$ = () =>
    api.gee.projects$()
