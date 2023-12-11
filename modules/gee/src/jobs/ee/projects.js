const {job} = require('#gee/jobs/job')

const worker$ = (_ignore, {sepalUser: {googleTokens}}) => {
    const {map} = require('rxjs')
    const http = require('#sepal/httpClient')

    if (!googleTokens) {
        throw Error('Requires a connected Google Account')
    }

    const headers = {Authorization: `Bearer ${googleTokens.accessToken}`}

    const cloudProjects$ = () =>
        http.get$('https://cloudresourcemanager.googleapis.com/v1/projects?filter=labels.earth-engine=""', {headers}).pipe(
            map(({body}) => JSON.parse(body)),
            map(({projects = []}) => projects)
        )

    return cloudProjects$()
}

module.exports = job({
    jobName: 'EE projects',
    jobPath: __filename,
    worker$,
    before: []
})
