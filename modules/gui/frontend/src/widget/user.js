import {EMPTY, Subject, timer} from 'rxjs'
import {connect, select} from 'store'
import {filter, map, switchMap} from 'rxjs/operators'
import {history} from 'route'
import {msg} from 'translate'
import Notifications from 'widget/notifications'
import React from 'react'
import actionBuilder from 'action-builder'
import api from 'api'

const login$ = new Subject()
const logout$ = new Subject()
const loadUser$ = new Subject()
const resetPassword$ = new Subject()

export const currentUser = () => select('user.currentUser')
export const invalidCredentials = () => select('user.login.invalidCredentials')
export const tokenUser = () => select('user.tokenUser')

export const login = ({username, password}) =>
    login$.next({username, password})

export const logout = () =>
    logout$.next()

export const resetPassword = ({token, username, password}) => {
    resetPassword$.next({token, username, password})
}

export const resetInvalidCredentials = () =>
    actionBuilder('RESET_INVALID_CREDENTIALS')
        .del('user.login.invalidCredentials')
        .dispatch()

export const revokeGoogleAccess$ = () =>
    api.user.revokeGoogleAccess$().pipe(
        map(() => loadUser$.next())
    )

export const requestPasswordReset$ = email =>
    api.user.requestPasswordReset$(email)

export const validateToken$ = token =>
    api.user.validateToken$(token).pipe(
        map(({user}) => {
            if (user) {
                return user
            } else {
                throw new Error('Invalid token')
            }
        })
    )

export const updateCurrentUserDetails$ = ({name, email, organization}) =>
    api.user.updateCurrentUserDetails$({name, email, organization}).pipe(
        map(({name, email, organization}) =>
            actionBuilder('UPDATE_USER_DETAILS', {name, email, organization})
                .set('user.currentUser.name', name)
                .set('user.currentUser.email', email)
                .set('user.currentUser.organization', organization)
                .dispatch()
        )
    )

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

class User extends React.Component {
    login$(username, password) {
        resetInvalidCredentials()
        return api.user.login$(username, password).pipe(
            map(user =>
                actionBuilder('CREDENTIALS_POSTED')
                    .set('user.currentUser', user)
                    .set('user.login.invalidCredentials', !user)
                    .set('user.loggedOn', !!user)
                    .dispatch()
            )
        )
    }

    handleLogin() {
        this.props.stream('LOGIN',
            login$.pipe(
                switchMap(({username, password}) =>
                    this.login$(username, password)
                )
            )
        )
    }

    handleLogout() {
        this.props.stream('LOGOUT',
            logout$.pipe(
                switchMap(() =>
                    api.user.logout$()
                )
            ),
            () => document.location = '/' // force full state reset
        )
    }

    handleLoadUser() {
        this.props.stream('LOAD_USER',
            loadUser$.pipe(
                switchMap(() =>
                    api.user.loadCurrentUser$().pipe(
                        // filter(user => user),
                        map(user => {
                            actionBuilder('SET_CURRENT_USER', {user})
                                .set('user', {
                                    currentUser: user,
                                    initialized: true,
                                    loggedOn: !!user
                                })
                                .dispatch()
                            if (user && user.googleTokens) {
                                const expiryDate = user.googleTokens.accessTokenExpiryDate
                                const fiveMinutes = 5 * 60 * 1000
                                return Math.max(fiveMinutes, expiryDate - fiveMinutes - Date.now())
                            }
                        }),
                        switchMap(reloadDelay => reloadDelay
                            ? timer(reloadDelay).pipe(
                                map(() => loadUser$.next())
                            )
                            : EMPTY
                        )
                    )
                )
            )
        )
    }

    handleResetPassword() {
        this.props.stream('RESET_PASSWORD',
            resetPassword$.pipe(
                switchMap(({token, username, password}) =>
                    api.user.resetPassword$(token, username, password).pipe(
                        switchMap(() => this.login$(username, password))
                    )
                )
            ),
            () => {
                Notifications.success({message: msg('landing.reset-password.success')})
                history().push('/process')
            }
        )
    }

    componentDidMount() {
        this.handleLogin()
        this.handleLogout()
        this.handleLoadUser()
        this.handleResetPassword()
        loadUser$.next()
    }

    render() {
        return null
    }
}

export default connect()(User)

User.propTypes = {}
