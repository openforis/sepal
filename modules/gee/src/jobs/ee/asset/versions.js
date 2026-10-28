import _ from 'lodash'
import {catchError, from, map, mergeMap, of, toArray} from 'rxjs'

import {job} from '#gee/jobs/job'
import ee from '#sepal/ee/ee'
import {ClientException} from '#sepal/exception'
import {fileName} from '#sepal/path'

// Each asset's change token: its Cloud API `updateTime`, exactly as Earth Engine reports it. A metadata read and nothing
// more - no image is evaluated. A Cloud GeoTIFF (`gs://`) is no asset Earth Engine keeps, so it has no token and is
// answered without a request; neither has an asset whose metadata carries none.
//
// The token is evidence that an asset changed, not proof that one did not: a live probe saw it advance for every member
// added, removed or replaced and every property edited, but overwrite exports, copies, moves and GeoTIFF-backed assets
// were not exercised.
//
// One failure does not fail the others. Earth Engine reports a missing asset and one this user may not read alike, and
// both are definitive; anything else may pass.

const MAX_IDS = 50
const CONCURRENCY = 4

const worker$ = ({requestArgs: {ids}}) => {
    if (!Array.isArray(ids) || ids.length > MAX_IDS || !ids.every(id => _.isString(id) && id.length)) {
        throw new ClientException(`Expected at most ${MAX_IDS} asset ids`, {
            userMessage: {message: 'Invalid asset ids', key: 'gee.asset.error.invalidIds', args: {max: MAX_IDS}}
        })
    }
    const unique = _.uniq(ids)
    return from(unique).pipe(
        mergeMap(id => assetVersion$(id).pipe(
            catchError(error => of({id, failure: failureOf(error)}))
        ), CONCURRENCY),
        toArray(),
        map(answers => {
            const byId = _.keyBy(answers, 'id')
            return {assets: unique.map(id => byId[id])}
        })
    )
}

const assetVersion$ = id => id.startsWith('gs://')
    ? of({id, version: null, unversioned: true})
    : ee.getAssetRecord$(id, 0).pipe(
        map(({type, updateTime}) => updateTime
            ? {id, type, version: updateTime}
            : {id, type, version: null, unversioned: true})
    )

const DEFINITIVE = [
    {code: 'PERMISSION_DENIED', pattern: /permission|forbidden|not authorized/i},
    {code: 'NOT_FOUND', pattern: /not found|does not exist|doesn't allow/i}
]

const failureOf = error => {
    const message = `${error?.message || error}`
    const definitive = DEFINITIVE.find(({pattern}) => pattern.test(message))
    return definitive
        ? {kind: 'DEFINITIVE', code: definitive.code}
        : {kind: 'TRANSIENT', code: 'UNAVAILABLE'}
}

export default job({
    jobName: 'EE asset versions',
    jobPath: fileName(import.meta.url),
    worker$
})
