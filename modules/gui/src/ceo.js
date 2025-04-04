import Papa from 'papaparse'
import {forkJoin, map, of, Subject, tap, zip} from 'rxjs'
import {catchError, switchMap, toArray} from 'rxjs/operators'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'

export const ceoLogout = () =>
    actionBuilder('RESET_CEO_TOKEN')
        .del('ceo')
        .dispatch()
        
export const ceoLogin$ = ({email, password}) => {
    return api.ceoGateway.login$({email, password}).pipe(
        tap(({sessionCookie}) =>
            actionBuilder('SET_CEO_TOKEN')
                .set('ceo.session.token', sessionCookie)
                .dispatch()
        )
    )
}

export const loadInstitutions$ = token => {
    return api.ceoGateway.getAllInstitutions$({
        token: token,
    }).pipe(
        map(institutions => institutions.filter(inst => inst.isMember === true)),
        switchMap(institutions => {
            if (institutions.length === 0) {
                return of([])
            }
            const institutions$ = institutions.map(institution => {
                return api.ceoGateway.getInstitution$({
                    token: token,
                    institutionId: institution.id
                }).pipe(
                    map(detailedInst => {
                        if (detailedInst && detailedInst.institutionAdmin === true) {
                            return {
                                value: institution.id, // detailedInst doesn't contain id
                                label: detailedInst.name
                            }
                        } else {
                            return null
                        }
                    }),
                    catchError(() => of(null))
                )
            })
            
            return forkJoin(institutions$).pipe(
                map(results => results.filter(Boolean))
            )
        }),
        tap(institutions => {
            actionBuilder('SET_INSTITUTIONS', {institutions})
                .set('ceo.data.institutions', institutions)
                .dispatch()
        })
    )
}

export const loadInstitutionProjects$ = (token, institutionId) => {
    return api.ceoGateway.getInstitutionProjects$({
        token: token,
        institutionId: institutionId
    }).pipe(
        map(projects => projects.map(({id, name}) => ({value: id, label: name}))),
        tap(projects =>
            actionBuilder('SET_PROJECTS', {projects})
                .set('ceo.data.projects', projects)
                .dispatch()
        )
    )
}

function parseCsvText(csvText) {

    const row$ = new Subject()
    const columns$ = new Subject()
    let isFirstRow = true

    Papa.parse(csvText, {
        worker: true,
        header: true,
        dynamicTyping: true,
        skipEmptyLines: 'greedy',
        step: ({data, meta: {fields}}) => {
            row$.next(data)
            if (isFirstRow) {
                columns$.next(fields)
                columns$.complete()
                isFirstRow = false
            }
        },
        complete: () => {
            row$.complete()
        }
    })

    return {row$, columns$}
}

export const loadProjectData$ = (token, projectId, csvType) =>
    api.ceoGateway.getProjectData$({
        token: token,
        projectId: projectId,
        csvType: csvType
    }).pipe(
        map(csvText => parseCsvText(csvText)),
        switchMap(({row$, columns$}) =>
            zip(
                row$.pipe(toArray()),
                columns$
            )
        )
    )
