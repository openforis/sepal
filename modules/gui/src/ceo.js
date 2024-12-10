import {map} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'

export const ceoLogout = () =>
    actionBuilder('RESET_CEO_TOKEN')
        .del('ceo')
        .dispatch()
        
export const ceoLogin$ = ({email, password}) => {
    return api.ceoGateway.login$({email, password})
}

export const credentialsPosted = ceoSessionToken =>
    actionBuilder('SET_CEO_TOKEN')
        .set('ceo.session.token', ceoSessionToken)
        .dispatch()

export const loadInstitutions$ = () => {
    return api.ceoGateway.getAllInstitutions$({
        token: 'this is my token',
    }).pipe(
        map(institutions => institutions.filter(inst => inst.isMember === true)),
        map(institutions => institutions.map(({id, name}) => ({value: id, label: name}))),
        map(institutions =>
            actionBuilder('SET_INSTITUTIONS', {institutions})
                .set('ceo.data.institutions', institutions)
                .dispatch()
        )
    )
}

export const loadProjectsForInstitutions$ = institutionId => {
    return api.ceoGateway.getInstitutionProjects$({
        token: 'this is my token',
        institutionId: institutionId
    }).pipe(
        map(projects => projects.map(({id, name}) => ({
            value: id,
            label: name
        }))),
        map(projects =>
            actionBuilder('SET_PROJECTS_FOR_INSTITUTION', {projects})
                .set('ceo.data.projects', projects)
                .dispatch()
        )
    )
}

