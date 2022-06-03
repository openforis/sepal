import {delete$, get$, post$} from 'http-client'

export default {
    loadCurrentUser$: () =>
        get$('/api/user/current', {
            validStatuses: [200, 401]
        }),

    loadUserMessages$: () =>
        get$('/api/notification/notifications'),

    updateMessage$: message =>
        post$(`/api/notification/messages/${message.id}`, {
            body: message
        }),

    removeMessage$: message =>
        delete$(`/api/notification/messages/${message.id}`),

    updateMessageState$: userMessage =>
        post$(`/api/notification/notifications/${userMessage.message.id}`, {
            body: {
                state: userMessage.state
            }
        }),

    loadCurrentUserReport$: () =>
        get$('/api/sessions/report'),

    login$: (username, password) =>
        post$('/api/user/login', {
            username,
            password,
            validStatuses: [200, 401]
        }),

    logout$: () =>
        post$('/api/user/logout'),

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

    updateCurrentUserDetails$: ({name, email, organization, emailNotificationsEnabled}) =>
        post$('/api/user/current/details', {
            body: {name, email, organization, emailNotificationsEnabled}
        }),

    changePassword$: ({oldPassword, newPassword}) =>
        post$('/api/user/current/password', {
            body: {oldPassword, newPassword}
        }),

    getGoogleAccessRequestUrl$: destinationUrl =>
        get$('/api/user/google/access-request-url', {
            query: {destinationUrl}
        }),

    revokeGoogleAccess$: () =>
        post$('/api/user/google/revoke-access'),

    updateCurrentUserSession$: session =>
        post$(`/api/sessions/session/${session.id}/earliestTimeoutTime`, {
            body: {
                hours: session.keepAlive
            }
        }),

    stopCurrentUserSession$: session =>
        delete$(`/api/sessions/session/${session.id}`),

    getUserList$: () =>
        get$('/api/user/list'),
    
    getBudgetReport$: () =>
        get$('/api/budget/report'),

    inviteUser$: userDetails =>
        post$('/api/user/invite', {
            body: userDetails
        }),

    updateUser$: userDetails =>
        post$('/api/user/details', {
            body: userDetails
        }),

    updateUserBudget$: budget =>
        post$('/api/budget', {
            body: budget
        }),

    updateBudgetUpdateRequest$: budgetUpdateRequest =>
        post$('/api/budget/requestUpdate', {
            body: budgetUpdateRequest
        })
}
