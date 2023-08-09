const {job} = require('#gee/jobs/job')

const worker$ = ({id}, {sepalUser: {googleTokens}}) => {
    const {map, merge, toArray, catchError, EMPTY} = require('rxjs')
    const Path = require('path')
    const http = require('#sepal/httpClient')
    const _ = require('lodash')

    if (!googleTokens) {
        throw Error('Requires a connected Google Account')
    }

    const headers = {Authorization: `Bearer ${googleTokens.accessToken}`}

    return id
        ? assets$(id)
        : roots$()

    function assets$(id) {
        return http.get$(`https://earthengine.googleapis.com/v1beta/${idToPath(id)}:listAssets`, {headers}).pipe(
            map(({body}) =>
                JSON.parse(body)
                    .assets
                    .map(({type, name: path}) => ({
                        parentId: id || null,
                        id: pathToId(path),
                        name: Path.basename(path),
                        type
                    }))
            )
        )
    }

    function idToPath(id) {
        const match = id.match(/^users\/.*/)
        return match ? `projects/earthengine-legacy/assets/${id}` : id
    }

    function pathToId(path) {
        const match = path.match(/^projects\/earthengine-legacy\/assets\/(.*)/)
        return match ? match[1] : path
    }

    function roots$() {
        return merge(
            legacyRoots$(),
            cloudProjects$()
        ).pipe(
            toArray(),
            map(roots => _.sortBy(roots.flat(), 'name'))
        )
    }
        
    function legacyRoots$() {
        return http.get$('https://earthengine.googleapis.com/v1beta/projects/earthengine-legacy:listAssets', {headers}).pipe(
            map(({body}) =>
                JSON.parse(body)
                    .assets
                    .map(({type, id: name}) => ({
                        parentId: id || null,
                        id: name,
                        name,
                        type
                    }))
            ),
            catchError(error => {
                // console.log(error)
                return EMPTY
            })
        )
    }
    
    function cloudProjects$() {
        return http.get$('https://cloudresourcemanager.googleapis.com/v1/projects?filter=labels.earth-engine=""', {headers}).pipe(
            map(({body}) =>
                JSON.parse(body)
                    .projects
                    .map(({type, projectId}) => ({
                        parentId: id || null,
                        id: `projects/${projectId}`,
                        name: projectId,
                        type
                    }))
            ),
            catchError(error => {
                // console.log(error)
                return EMPTY
            })
        )
    }
}

module.exports = job({
    jobName: 'EE list assets',
    jobPath: __filename,
    worker$
})
