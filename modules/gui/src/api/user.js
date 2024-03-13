import {delete$, get$, post$} from '~/http-client'

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

    signUp$: ({username, name, email, organization, intendedUse}, recaptchaToken) =>
        post$('/api/user/signup', {
            body: {
                username,
                name,
                email,
                organization,
                intendedUse,
                recaptchaToken,
                action: 'SIGN_UP'
            }
        }),

    login$: ({username, password}) =>
        post$('/api/user/login', {
            username,
            password,
            validStatuses: [200, 401],
        }),

    logout$: () =>
        post$('/api/user/logout'),

    requestPasswordReset$: ({email, optional, recaptchaToken}) =>
        post$('/api/user/password/reset-request', {
            body: {email, optional, recaptchaToken}
        }),

    validateToken$: token =>
        post$('/api/user/validate/token', {
            body: {token}
        }),

    validateUsername$: ({username, recaptchaToken}) =>
        post$('/api/user/validate/username', {
            body: {username, recaptchaToken}
        }),
    
    validateEmail$: ({email, recaptchaToken}) =>
        post$('/api/user/validate/email', {
            body: {email, recaptchaToken}
        }),
    
    resetPassword$: ({token, password, recaptchaToken}) =>
        post$('/api/user/password/reset', {
            body: {token, password, recaptchaToken}
        }),

    updateCurrentUserDetails$: ({name, email, organization, intendedUse, emailNotificationsEnabled, manualMapRenderingEnabled}) =>
        post$('/api/user/current/details', {
            body: {name, email, organization, intendedUse, emailNotificationsEnabled, manualMapRenderingEnabled}
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

    updateGoogleProject$: (projectId, legacyProject) =>
        post$('/api/user/google/project', {
            query: {projectId, legacyProject}
        }),

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

    lockUser$: username =>
        post$('/api/user/lock', {
            body: {username}
        }),

    unlockUser$: username =>
        post$('/api/user/unlock', {
            body: {username}
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
