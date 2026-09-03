import {catchError, EMPTY, map} from 'rxjs'

import {get$} from '#sepal/httpClient'
import {getLogger} from '#sepal/log'

import {sepalAdminPassword, sepalAdminUsername, sepalHost} from './config.js'

const log = getLogger('apiService')

const fetchAppsFromApi$ = () => {
    const apiUrl = `https://${sepalHost}/api/apps/list`
    return get$(apiUrl, {
        username: sepalAdminUsername,
        password: sepalAdminPassword,
        responseType: 'json'
    }).pipe(
        map(({body}) => body),
        catchError(error => {
            log.error('Failed to fetch apps from API:', error)
            return EMPTY
        })
    )
}

const fetchCatalog$ = url =>
    get$(url, {responseType: 'json'}).pipe(
        map(({body}) => body),
        catchError(error => {
            log.error(`Failed to fetch apps catalog from ${url}:`, error)
            return EMPTY
        })
    )

export {
    fetchAppsFromApi$,
    fetchCatalog$
}
