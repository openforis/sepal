const {job} = require('#gee/jobs/job')

const worker$ = ({
    requestArgs: {id},
    credentials: {sepalUser: {username, googleTokens}}
}) => {
    const {map, merge, toArray, of, switchMap, mergeMap, catchError} = require('rxjs')
    const http = require('#sepal/httpClient')
    const ee = require('#sepal/ee/ee')
    const log = require('#sepal/log').getLogger('ee')
    const _ = require('lodash')

    if (!googleTokens) {
        throw Error('Requires a connected Google Account')
    }

    const headers = {'x-goog-user-project': ee.data.getProject(), Authorization: `Bearer ${googleTokens.accessToken}`}

    const assets$ = parentId =>
        ee.listAssets$(parentId).pipe(
            map(assets =>
                assets.map(({id, type, updateTime}) => ({id, type, updateTime}))
            )
        )

    const roots$ = () =>
        merge(
            legacyRoots$(),
            cloudProjectRoots$()
        ).pipe(
            switchMap(roots => of(...roots)),
            mergeMap(root => getRootInfo$(root)),
            map(({id, name, quota}) => ({id, type: 'Folder', name, quota})),
            toArray(),
            map(array => _.orderBy(array, ['id']))
        )

    const getRootInfo$ = ({id, name}) =>
        http.get$(`https://earthengine.googleapis.com/v1/${name || id}`, {
            headers
        }).pipe(
            map(({body}) => JSON.parse(body)),
            catchError(() => {
                log.debug(`Unable to determine quota for ${id || name}`)
                return of({id, name, type: 'FOLDER'})
            })
        )

    const legacyRoots$ = () =>
        ee.listBuckets$('projects/earthengine-legacy').pipe(
            map(({assets}) =>
                _.isArray(assets)
                    ? assets
                    : []
            ),
            catchError(e => {
                log.info(`Failed to load legacy roots ${username}: ${id}`, e)
                return of([])
            })
        )
    
    const cloudProjectRoots$ = () =>
        http.get$('https://cloudresourcemanager.googleapis.com/v1/projects?filter=labels.earth-engine=""', {
            headers: {Authorization: `Bearer ${googleTokens.accessToken}`}
        }).pipe(
            map(({body}) => JSON.parse(body)),
            map(mapCloudProjectRoots),
            catchError(e => {
                log.warn(`Failed to load cloud project roots for ${username}: ${id}`, e)
                return of([])
            })
        )

    const mapCloudProjectRoots = results =>
        results?.projects?.map(({projectId}) => ({
            id: `projects/${projectId}/assets`
        })) || []

    return id
        ? assets$(id)
        : roots$()

}

module.exports = job({
    jobName: 'EE list assets',
    jobPath: __filename,
    worker$
})
