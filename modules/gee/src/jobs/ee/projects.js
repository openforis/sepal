import {map} from 'rxjs'

import {job} from '#gee/jobs/job'
import * as http from '#sepal/httpClient'
import {fileName} from '#sepal/path'

const worker$ = ({
    credentials: {sepalUser: {googleTokens}}
}) => {

    if (!googleTokens) {
        throw Error('Requires a connected Google Account')
    }

    const headers = {Authorization: `Bearer ${googleTokens.accessToken}`}

    const cloudProjects$ = () =>
        http.get$('https://cloudresourcemanager.googleapis.com/v1/projects?filter=labels.earth-engine=""', {
            headers
        }).pipe(
            map(({body}) => JSON.parse(body)),
            map(({projects = []}) => projects)
        )

    return cloudProjects$()
}

export default job({
    jobName: 'EE projects',
    jobPath: fileName(import.meta.url),
    worker$,
    before: []
})
