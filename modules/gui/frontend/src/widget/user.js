import {Subject, timer} from 'rxjs'
import {connect, select} from 'store'
import {filter, map, switchMap} from 'rxjs/operators'
import React from 'react'
import actionBuilder from 'action-builder'
import api from 'api'

const loadUser$ = new Subject()

export const currentUser = () => select('user.currentUser')
export const invalidCredentials = () => select('user.login.invalidCredentials')

export const login$ = (username, password) => {
    resetInvalidCredentials()
    return api.user.login$(username, password).pipe(
        map(user => actionBuilder('CREDENTIALS_POSTED')
            .set('user.currentUser', user)
            .set('user.login.invalidCredentials', !user)
            .set('user.loggedOn', !!user)
            .dispatch()
        )
    )
}

export const logout = () => {
    api.user.logout$().subscribe(() => document.location = '/')
}
    
export const revokeGoogleAccess$ = () =>
    api.user.revokeGoogleAccess$().pipe(
        map(() => loadUser$.next())
    )
    
export const resetInvalidCredentials = () =>
    actionBuilder('RESET_INVALID_CREDENTIALS')
        .del('user.login.invalidCredentials')
        .dispatch()

export const resetPassword$ = (token, username, password) =>
    api.user.resetPassword$(token, username, password).pipe(
        switchMap(() => login$(username, password))
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

export const tokenUser = () =>
    select('user.tokenUser')

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
                .assignValueByTemplate('user.currentUserReport.sessions', {
                    id: session.id
                }, {
                    earliestTimeoutHours: session.keepAlive
                })
                .dispatch()
        )
    )
    
export const stopCurrentUserSession$ = session =>
    api.user.stopCurrentUserSession$(session).pipe(
        map(() =>
            actionBuilder('STOP_USER_SESSION_POSTED', {session})
                .delValueByTemplate('user.currentUserReport.sessions', {
                    id: session.id
                })
                .dispatch()
        )
    )
    
class User extends React.Component {
    componentDidMount() {
        this.props.stream('LOAD_USER',
            loadUser$.pipe(
                switchMap(
                    () => api.user.loadCurrentUser$().pipe(
                        map(user =>
                            actionBuilder('SET_CURRENT_USER', {user})
                                .set('user', {
                                    currentUser: user,
                                    initialized: true,
                                    loggedOn: !!user
                                })
                                .dispatch()
                        ),
                    )
                )
            )
        )

        this.props.stream('SCHEDULE_RELOAD_USER',
            loadUser$.pipe(
                filter(user => user && user.googleTokens),
                map(user => {
                    const expiryDate = user.googleTokens.accessTokenExpiryDate
                    const fiveMinutes = 5 * 60 * 1000
                    const delay = Math.max(fiveMinutes, expiryDate - fiveMinutes - Date.now())
                    return delay
                }),
                // map(() => 2000),
                switchMap(reloadInterval =>
                    timer(reloadInterval).pipe(
                        map(() => loadUser$.next())
                    )
                )
            )
        )

        loadUser$.next()
    }

    render() {
        return null
    }
}

export default connect()(User)

User.propTypes = {}
