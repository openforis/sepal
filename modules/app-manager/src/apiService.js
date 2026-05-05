const {EMPTY, catchError, map} = require('rxjs')
const {get$} = require('#sepal/httpClient')
const log = require('#sepal/log').getLogger('apiService')

const fetchCatalog$ = url =>
    get$(url).pipe(
        map(response => JSON.parse(response.body)),
        catchError(error => {
            log.error(`Failed to fetch apps catalog from ${url}:`, error)
            return EMPTY
        })
    )

module.exports = {fetchCatalog$}
