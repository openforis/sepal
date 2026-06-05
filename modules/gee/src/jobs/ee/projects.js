import {job} from '#gee/jobs/job'
import {map} from 'rxjs'
import * as http from '#sepal/httpClient'
import {fileURLToPath} from 'url'

const __filename = fileURLToPath(import.meta.url)

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
    jobPath: __filename,
    worker$,
    before: []
})
