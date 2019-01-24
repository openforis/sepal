import {delete$, get$, post$} from 'http-client'
import {map} from 'rxjs/operators'
import {of} from 'rxjs'

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
        }).pipe(toResponse),

    validateToken$: token =>
        post$('/api/user/validate-token', {
            body: {token}
        }).pipe(toResponse),

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

/* eslint-disable */
const _sampleUserReport = {
    'sessions': [{
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-1',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'T2Small',
            'path': 'sandbox/instance-type/T2Small',
            'name': 't2.small',
            'description': '1 CPU / 2.0 GiB',
            'hourlyCost': 0.025
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }, {
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-2',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'M3Medium',
            'path': 'sandbox/instance-type/M3Medium',
            'name': 'm3.medium',
            'description': '1 CPU / 3.75 GiB',
            'hourlyCost': 0.073
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }, {
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-3',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'M44xlarge',
            'path': 'sandbox/instance-type/M44xlarge',
            'name': 'm4.4xlarge',
            'description': '16 CPU / 64.0 GiB',
            'hourlyCost': 0.95
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }, {
        'id': 'b9c6784f-84af-4b49-93bd-91ee57c0595c-4',
        'path': 'sandbox/session/b9c6784f-84af-4b49-93bd-91ee57c0595c',
        'username': 'paolini',
        'status': 'ACTIVE',
        'host': '54.188.53.50',
        'earliestTimeoutHours': 0.0,
        'instanceType': {
            'id': 'R48xlarge',
            'path': 'sandbox/instance-type/R48xlarge',
            'name': 'r4.8xlarge',
            'description': '32 CPU / 244.0 GiB',
            'hourlyCost': 2.371
        },
        'creationTime': '2018-09-19T13:27:50',
        'costSinceCreation': 0.0
    }],
    'instanceTypes': [{
        'id': 'T2Small',
        'path': 'sandbox/instance-type/T2Small',
        'name': 't2.small',
        'description': '1 CPU / 2.0 GiB',
        'hourlyCost': 0.025
    }, {
        'id': 'M3Medium',
        'path': 'sandbox/instance-type/M3Medium',
        'name': 'm3.medium',
        'description': '1 CPU / 3.75 GiB',
        'hourlyCost': 0.073
    }, {
        'id': 'M4Large',
        'path': 'sandbox/instance-type/M4Large',
        'name': 'm4.large',
        'description': '2 CPU / 8.0 GiB',
        'hourlyCost': 0.119
    }, {
        'id': 'M4Xlarge',
        'path': 'sandbox/instance-type/M4Xlarge',
        'name': 'm4.xlarge',
        'description': '4 CPU / 16.0 GiB',
        'hourlyCost': 0.238
    }, {
        'id': 'M42xlarge',
        'path': 'sandbox/instance-type/M42xlarge',
        'name': 'm4.2xlarge',
        'description': '8 CPU / 32.0 GiB',
        'hourlyCost': 0.475
    }, {
        'id': 'M44xlarge',
        'path': 'sandbox/instance-type/M44xlarge',
        'name': 'm4.4xlarge',
        'description': '16 CPU / 64.0 GiB',
        'hourlyCost': 0.95
    }, {
        'id': 'M410xlarge',
        'path': 'sandbox/instance-type/M410xlarge',
        'name': 'm4.10xlarge',
        'description': '40 CPU / 160.0 GiB',
        'hourlyCost': 2.377
    }, {
        'id': 'M416xlarge',
        'path': 'sandbox/instance-type/M416xlarge',
        'name': 'm4.16xlarge',
        'description': '64 CPU / 256.0 GiB',
        'hourlyCost': 3.803
    }, {
        'id': 'C4Large',
        'path': 'sandbox/instance-type/C4Large',
        'name': 'c4.large',
        'description': '2 CPU / 3.75 GiB',
        'hourlyCost': 0.113
    }, {
        'id': 'C4Xlarge',
        'path': 'sandbox/instance-type/C4Xlarge',
        'name': 'c4.xlarge',
        'description': '4 CPU / 7.5 GiB',
        'hourlyCost': 0.226
    }, {
        'id': 'C42xlarge',
        'path': 'sandbox/instance-type/C42xlarge',
        'name': 'c4.2xlarge',
        'description': '8 CPU / 15.0 GiB',
        'hourlyCost': 0.453
    }, {
        'id': 'C44xlarge',
        'path': 'sandbox/instance-type/C44xlarge',
        'name': 'c4.4xlarge',
        'description': '16 CPU / 30.0 GiB',
        'hourlyCost': 0.905
    }, {
        'id': 'C48xlarge',
        'path': 'sandbox/instance-type/C48xlarge',
        'name': 'c4.8xlarge',
        'description': '36 CPU / 60.0 GiB',
        'hourlyCost': 1.811
    }, {
        'id': 'R4Large',
        'path': 'sandbox/instance-type/R4Large',
        'name': 'r4.large',
        'description': '2 CPU / 15.25 GiB',
        'hourlyCost': 0.148
    }, {
        'id': 'R4Xlarge',
        'path': 'sandbox/instance-type/R4Xlarge',
        'name': 'r4.xlarge',
        'description': '4 CPU / 30.5 GiB',
        'hourlyCost': 0.296
    }, {
        'id': 'R42xlarge',
        'path': 'sandbox/instance-type/R42xlarge',
        'name': 'r4.2xlarge',
        'description': '8 CPU / 61.0 GiB',
        'hourlyCost': 0.593
    }, {
        'id': 'R44xlarge',
        'path': 'sandbox/instance-type/R44xlarge',
        'name': 'r4.4xlarge',
        'description': '16 CPU / 122.0 GiB',
        'hourlyCost': 1.186
    }, {
        'id': 'R48xlarge',
        'path': 'sandbox/instance-type/R48xlarge',
        'name': 'r4.8xlarge',
        'description': '32 CPU / 244.0 GiB',
        'hourlyCost': 2.371
    }, {
        'id': 'R416xlarge',
        'path': 'sandbox/instance-type/R416xlarge',
        'name': 'r4.16xlarge',
        'description': '64 CPU / 488.0 GiB',
        'hourlyCost': 4.742
    }, {
        'id': 'X116xlarge',
        'path': 'sandbox/instance-type/X116xlarge',
        'name': 'x1.16xlarge',
        'description': '64 CPU / 976.0 GiB',
        'hourlyCost': 8.003
    }, {
        'id': 'X132xlarge',
        'path': 'sandbox/instance-type/X132xlarge',
        'name': 'x1.32xlarge',
        'description': '128 CPU / 1920.0 GiB',
        'hourlyCost': 16.006
    }],
    'spending': {
        'monthlyInstanceBudget': 1.0,
        'monthlyInstanceSpending': 0.025,
        'monthlyStorageBudget': 1.0,
        'monthlyStorageSpending': 2.233275753451851E-5,
        'storageQuota': 20.0,
        'storageUsed': 9.6E-5
    }
}
