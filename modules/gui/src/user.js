import {EMPTY, catchError, map, of, switchMap, tap} from 'rxjs'
import {history} from 'route'
import {msg} from 'translate'
import {publishCurrentUserEvent, publishEvent} from 'eventPublisher'
import {select} from 'store'
import Notifications from 'widget/notifications'
import actionBuilder from 'action-builder'
import api from 'api'

export const currentUser = () => select('user.currentUser')
export const invalidCredentials = () => select('user.login.invalidCredentials')
export const tokenUser = () => select('user.tokenUser')

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
    return api.user.login$(username, password).pipe(
        catchError(() => {
            Notifications.error({message: msg('landing.login.error')})
            return EMPTY
        }),
        tap(user => {
            publishEvent(user ? 'login' : 'login_failed')
            publishCurrentUserEvent(user)
        }),
        map(user => credentialsPosted(user))
    )
}

export const logout$ = () =>
    api.user.logout$().pipe(
        tap(() => document.location = '/' /* force full state reset*/)
    )

export const resetPassword$ = ({token, username, password, type}) =>
    api.user.resetPassword$(token, username, password).pipe(
        tap(() => publishEvent(type === 'reset' ? 'password_reset' : 'user_activated')),
        switchMap(() => api.user.login$(username, password)),
        tap(user => {
            credentialsPosted(user)
            history().push('/process')
            Notifications.success({message: msg('landing.reset-password.success')})
        }),
        catchError(() => {
            Notifications.error({message: msg('landing.login.error')})
            return EMPTY
        })
    )

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

export const requestPasswordReset$ = email =>
    api.user.requestPasswordReset$(email).pipe(
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

export const updateCurrentUserDetails$ = ({name, email, organization, intendedUse, emailNotificationsEnabled}) => {
    return api.user.updateCurrentUserDetails$({name, email, organization, intendedUse, emailNotificationsEnabled}).pipe(
        map(({name, email, organization}) =>
            actionBuilder('UPDATE_USER_DETAILS', {name, email, organization, intendedUse})
                .set('user.currentUser.name', name)
                .set('user.currentUser.email', email)
                .set('user.currentUser.organization', organization)
                .set('user.currentUser.intendedUse', intendedUse)
                .set('user.currentUser.emailNotificationsEnabled', emailNotificationsEnabled)
                .dispatch()
        )
    )
}

export const changeCurrentUserPassword$ = ({oldPassword, newPassword}) =>
    api.user.changePassword$({oldPassword, newPassword})

export const updateCurrentUserSession$ = session =>
    api.user.updateCurrentUserSession$(session).pipe(
        map(() =>
            actionBuilder('UPDATE_USER_SESSION_POSTED', {session})
                .assign(['user.currentUserReport.sessions', {id: session.id}], {
                    earliestTimeoutHours: session.keepAlive
                })
                .dispatch()
        )
    )

export const stopCurrentUserSession$ = session =>
    api.user.stopCurrentUserSession$(session).pipe(
        map(() =>
            actionBuilder('STOP_USER_SESSION_POSTED', {session})
                .del(['user.currentUserReport.sessions', {id: session.id}])
                .dispatch()
        )
    )

const credentialsPosted = user =>
    actionBuilder('CREDENTIALS_POSTED')
        .set('user.currentUser', user)
        .set('user.login.invalidCredentials', !user)
        .set('user.loggedOn', !!user)
        .dispatch()
