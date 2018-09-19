import {get$, post$} from 'http-client'
import {map} from 'rxjs/operators'

export default {
    loadCurrentUser$: () =>
        get$('/api/user/current', {
            validStatuses: [200, 401]
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
    requestPasswordReset$: (email) =>
        post$('/api/user/password/reset-request', {
            body: {email}
        }),
    validateToken$: (token) =>
        post$('/api/user/validate-token', {
            body: {token}
        }),
    resetPassword$: (token, username, password) =>
        post$('/api/user/password/reset', {
            body: {token, password}
        }),
    updateUserDetails$: ({name, email, organization}) =>
        post$('/api/user/current/details', {
            body: {name, email, organization}
        }),
    changePassword$: ({oldPassword, newPassword}) =>
        post$('/api/user/current/password', {
            body: {oldPassword, newPassword}
        }).pipe(toResponse),
    getGoogleAccessRequestUrl$: (destinationUrl) =>
        get$(`/api/user/google/access-request-url?destinationUrl=${destinationUrl}`)
            .pipe(toResponse),
    revokeGoogleAccess$: () =>
        post$('/api/user/google/revoke-access')
            .pipe(toResponse)
}

const toResponse = map(e => e.response)
