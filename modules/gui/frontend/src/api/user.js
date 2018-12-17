import {delete$, get$, post$} from 'http-client'
import {map} from 'rxjs/operators'

export default {
    loadCurrentUser$: () =>
        get$('/api/user/current', {
            validStatuses: [200, 401]
        }).pipe(toResponse),

    loadUserMessages$: () =>
        get$('/api/notification/notifications').pipe(toResponse),

    updateMessage$: message =>
        post$(`/api/notification/messages/${message.id}`, {
            body: message
        }).pipe(toResponse),

    removeMessage$: message =>
        delete$(`/api/notification/messages/${message.id}`).pipe(toResponse),

    updateMessageState$: userMessage =>
        post$(`/api/notification/notifications/${userMessage.message.id}`, {
            body: {
                state: userMessage.state
            }
        }).pipe(toResponse),

    loadCurrentUserReport$: () =>
        get$('/api/sessions/report')
            .pipe(toResponse),

    login$: (username, password) =>
        post$('/api/user/login', {
            username, password,
            validStatuses: [200, 401]
        }).pipe(toResponse),

    logout$: () =>
        post$('/api/user/logout').pipe(toResponse),

    requestPasswordReset$: email =>
        post$('/api/user/password/reset-request', {
            body: {email}
        }),

    validateToken$: token =>
        post$('/api/user/validate-token', {
            body: {token}
        }),

    resetPassword$: (token, username, password) =>
        post$('/api/user/password/reset', {
            body: {token, password}
        }),

    updateCurrentUserDetails$: ({name, email, organization}) =>
        post$('/api/user/current/details', {
            body: {name, email, organization}
        }).pipe(toResponse),

    changePassword$: ({oldPassword, newPassword}) =>
        post$('/api/user/current/password', {
            body: {oldPassword, newPassword}
        }).pipe(toResponse),

    getGoogleAccessRequestUrl$: destinationUrl =>
        get$('/api/user/google/access-request-url', {query: {destinationUrl}})
            .pipe(toResponse),

    revokeGoogleAccess$: () =>
        post$('/api/user/google/revoke-access')
            .pipe(toResponse),

    updateUserSession$: session =>
        post$(`/api/sessions/session/${session.id}/earliestTimeoutTime`, {
            body: {
                hours: session.keepAlive
            }
        }).pipe(toResponse),

    stopUserSession$: session =>
        delete$(`/api/sessions/session/${session.id}`),

    getUserList$: () =>
        get$('/api/user/list')
            .pipe(toResponse),

    getBudgetReport$: () =>
        get$('/api/budget/report')
            .pipe(toResponse),

    inviteUser$: userDetails =>
        post$('/api/user/invite', {
            body: userDetails
        }).pipe(toResponse),

    updateUser$: userDetails =>
        post$('/api/user/details', {
            body: userDetails
        }).pipe(toResponse),

    updateUserBudget$: budget =>
        post$('/api/budget', {
            body: budget
        }).pipe(toResponse)
}

const toResponse = map(e => e.response)
