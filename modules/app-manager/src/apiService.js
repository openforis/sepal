import {catchError, EMPTY, map} from 'rxjs'

import {get$} from '#sepal/httpClient'
import {getLogger} from '#sepal/log'

const log = getLogger('apiService')

const fetchCatalog$ = url =>
    get$(url).pipe(
        map(response => JSON.parse(response.body)),
        catchError(error => {
            log.error(`Failed to fetch apps catalog from ${url}:`, error)
            return EMPTY
        })
    )

export {fetchCatalog$}
