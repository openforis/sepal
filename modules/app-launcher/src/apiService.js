const {EMPTY, catchError, map} = require('rxjs')
const {get$} = require('#sepal/httpClient')
const {sepalHost, sepalAdminPassword} = require('./config')
const log = require('#sepal/log').getLogger('apiService')

const fetchAppsFromApi$ = () => {
    const apiUrl = `https://${sepalHost}/api/apps/list`
    return get$(apiUrl, {
        username: 'sepalsAdmin',
        password: sepalAdminPassword,
    }).pipe(
        map(response => JSON.parse(response.body)),
        catchError(error => {
            log.error('Failed to fetch apps from API:', error)
            return EMPTY
        })
    )
}

module.exports = {
    fetchAppsFromApi$
}
