import {map, tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {select} from '~/store'

export const isCeoValid = () => {
    // eslint-disable-next-line no-console
    console.log('isCeoValid', select('ceo.invalidCredentials'))
    return select('ceo.session.token')
}

export const resetCeoToken = () =>
    actionBuilder('RESET_CEO_TOKEN')
        .del('ceo.session.token')
        .dispatch()
        
export const ceoLogin$ = ({email, password}) => {
    resetCeoToken()
    return api.ceoGateway.login$({email, password}).pipe(
        tap(token => {
            actionBuilder('UPDATE_USER_DETAILS', {token})
                .set('ceo.token', token)
        })
    )
}

export const loadInstitutions$ = () => {
    return api.ceoGateway.getAllInstitutions$({
        token: 'this is my token',
    }).pipe(
        map(institutions => institutions.filter(inst => inst.isMember === true)),
        map(institutions => institutions.map(({id, name}) => ({value: id, name}))),
        map(institutions =>
            actionBuilder('SET_INSTITUTIONS', {institutions})
                .set('ceo.data.userInstitutions', institutions)
                .dispatch()
        )
    )
}

export const credentialsPosted = ceoSessionToken =>
    actionBuilder('CEO_CREDENTIALS_POSTED')
        .set('ceo.session.token', ceoSessionToken)
        .dispatch()

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

// export const stopCurrentUserSession$ = session =>
//     api.user.stopCurrentUserSession$(session).pipe(
//         tap(() =>
//             actionBuilder('STOP_USER_SESSION_POSTED', {session})
//                 .del(['user.currentUserReport.sessions', {id: session.id}])
//                 .dispatch()
//         )
//     )

// export const updateGoogleProject$ = projectId =>
//     api.user.updateGoogleProject$(projectId, !projectId).pipe(
//         tap(() =>
//             actionBuilder('UPDATE_GOOGLE_PROJECT')
//                 .set('user.currentUser.googleTokens.projectId', projectId)
//                 .dispatch()
//         ),
//         switchMap(() => loadUser$())
//     )

export const loadCountryForArea$ = areaId => {
    return api.ceoGateway.queryEETable$({
        select: ['parent_id'],
        // from: countryEETable,
        where: [['id', 'equals', areaId]],
        orderBy: ['label']
    }).pipe(
        map(rows => rows.length ? rows[0]['parent_id'] : null)
    )
}

export const projects$ = () =>
    api.gee.projects$()
