const {job} = require('#gee/jobs/job')

const worker$ = ({id}, {sepalUser: {googleTokens}}) => {
    const {map, merge, toArray} = require('rxjs')
    const http = require('#sepal/httpClient')
    const ee = require('#sepal/ee')
    const _ = require('lodash')

    if (!googleTokens) {
        throw Error('Requires a connected Google Account')
    }

    const headers = {Authorization: `Bearer ${googleTokens.accessToken}`}

    const assets$ = parentId =>
        ee.listAssets$(parentId).pipe(
            map(assets =>
                assets.map(({id, type}) => ({
                    id,
                    type
                }))
            )
        )

    const roots$ = () =>
        merge(
            legacyRoots$(),
            cloudProjectRoots$()
        ).pipe(
            toArray(),
            map(roots => _.sortBy(roots.flat(), 'id'))
        )
        
    const legacyRoots$ = () =>
        http.get$('https://earthengine.googleapis.com/v1beta/projects/earthengine-legacy:listAssets', {headers}).pipe(
            map(({body}) => JSON.parse(body)),
            map(({assets}) =>
                assets.map(({id}) => ({
                    id,
                    type: 'Folder'
                }))
            )
        )
    
    const cloudProjectRoots$ = () =>
        http.get$('https://cloudresourcemanager.googleapis.com/v1/projects?filter=labels.earth-engine=""', {headers}).pipe(
            map(({body}) => JSON.parse(body)),
            map(({projects}) =>
                projects.map(({projectId}) => ({
                    id: `projects/${projectId}/assets`,
                    type: 'Folder'
                }))
            )
        )

    return id
        ? assets$(id)
        : roots$()

}

module.exports = job({
    jobName: 'EE list assets',
    jobPath: __filename,
    worker$
})
