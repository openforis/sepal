import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'
import {format} from 'node:util'

import {Observable} from 'rxjs'

// The /assetVersions boundary over a fake Earth Engine API client: what each asset's token is, what is never asked of
// Earth Engine, how failures are told apart, and how many reads run at once.

const requests = []
let answer = () => ({})

const ee = {
    getAssetRecord$: id => new Observable(subscriber => {
        const name = nameOf(id)
        const respond = (asset, error) => {
            if (error) {
                subscriber.error(error)
            } else {
                subscriber.next(asset)
                subscriber.complete()
            }
        }
        requests.push({name, respond})
        const answered = answer(name)
        if (answered !== undefined) {
            answered instanceof Error ? respond(undefined, answered) : respond(answered)
        }
    })
}

mock.module('#sepal/ee/ee', {exports: {default: ee}})
mock.module('#gee/jobs/job', {exports: {job: config => config}})

const {default: versions} = await import('#gee/jobs/ee/asset/versions')
const {worker$} = versions

const run = ids => {
    let value, error
    worker$({requestArgs: {ids}, credentials: {}}).subscribe({next: v => { value = v }, error: e => { error = e }})
    return {value, error}
}

const nameOf = id => `projects/earthengine-legacy/assets/${id}`

beforeEach(() => {
    requests.length = 0
    answer = () => ({type: 'IMAGE', updateTime: '2026-10-01T06:23:41.888670Z'})
})

describe('an asset version', () => {
    it('is the updateTime Earth Engine reports, at its full precision, read without any evaluation', () => {
        answer = name => ({
            [nameOf('users/x/image')]: {type: 'IMAGE', updateTime: '2026-10-01T06:23:41.888670Z'},
            [nameOf('users/x/collection')]: {type: 'IMAGE_COLLECTION', updateTime: '2026-10-01T06:31:09.600525Z'}
        })[name]

        const {value} = run(['users/x/image', 'users/x/collection'])

        assert.deepEqual(value.assets, [
            {id: 'users/x/image', type: 'IMAGE', version: '2026-10-01T06:23:41.888670Z'},
            {id: 'users/x/collection', type: 'IMAGE_COLLECTION', version: '2026-10-01T06:31:09.600525Z'}
        ])
    })

    it('is asked for once however often the id is repeated', () => {
        const {value} = run(['users/x/image', 'users/x/image'])

        assert.equal((requests).length, 1)
        assert.deepEqual(value.assets.map(({id}) => id), ['users/x/image'])
    })
})

describe('an asset without a version', () => {
    it('is a Cloud GeoTIFF, answered without asking Earth Engine', () => {
        const {value} = run(['gs://bucket/image.tif'])

        assert.equal((requests).length, 0)
        assert.deepEqual(value.assets, [{id: 'gs://bucket/image.tif', version: null, unversioned: true}])
    })

    it('is one whose metadata carries no updateTime, and is not a failure', () => {
        answer = () => ({type: 'IMAGE'})

        const {value} = run(['users/x/image'])

        assert.deepEqual(value.assets, [{id: 'users/x/image', type: 'IMAGE', version: null, unversioned: true}])
    })
})

describe('a failed read', () => {
    for (const [_case, message, kind, code] of [
        ['missing', 'Asset \'x\' does not exist or doesn\'t allow this operation.', 'DEFINITIVE', 'NOT_FOUND'],
        ['not readable by this user', 'Permission denied', 'DEFINITIVE', 'PERMISSION_DENIED'],
        ['anything else', 'Service unavailable', 'TRANSIENT', 'UNAVAILABLE']
    ]) {
        it(format('of an asset %s fails that asset alone', _case), () => {
            answer = name => name === nameOf('users/x/failing') ? new Error(message) : {type: 'IMAGE', updateTime: 'T'}

            const {value, error} = run(['users/x/failing', 'users/x/image'])

            assert.equal(error, undefined)
            assert.deepEqual(value.assets, [
                {id: 'users/x/failing', failure: {kind, code}},
                {id: 'users/x/image', type: 'IMAGE', version: 'T'}
            ])
        })
    }
})

describe('a request', () => {
    it('reads at most four assets at once', () => {
        answer = () => undefined
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => `users/x/${id}`)

        const result = {}
        worker$({requestArgs: {ids}, credentials: {}}).subscribe(value => result.value = value)
        assert.equal((requests).length, 4)

        requests[0].respond({type: 'IMAGE', updateTime: 'T'})
        assert.equal((requests).length, 5)
        requests.slice(1).forEach(request => request.respond({type: 'IMAGE', updateTime: 'T'}))
        requests[5].respond({type: 'IMAGE', updateTime: 'T'})

        assert.deepEqual(result.value.assets.map(({id}) => id), ids)
    })

    for (const [_case, ids] of [
        ['more than fifty ids', Array.from({length: 51}, (_, i) => `users/x/${i}`)],
        ['an id that is not a string', ['users/x/a', 7]],
        ['no list', undefined]
    ]) {
        it(format('with %s is refused before anything is read', _case), () => {
            assert.throws(() => run(ids), error => error.message.includes('Expected at most 50 asset ids'))
            assert.equal((requests).length, 0)
        })
    }
})
