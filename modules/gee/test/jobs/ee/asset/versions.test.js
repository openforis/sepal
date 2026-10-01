import {jest} from '@jest/globals'
import {Observable} from 'rxjs'

// The /assetVersions boundary over a fake Earth Engine API client: what each asset's token is, what is never asked of
// Earth Engine, how failures are told apart, and how many reads run at once.

const requests = []
let answer = () => ({})

const ee = {
    $: ({operation}) => new Observable(subscriber => operation(
        value => {
            subscriber.next(value)
            subscriber.complete()
        },
        error => subscriber.error(error)
    )),
    apiclient: {
        Call: class {
            constructor(callback) {
                this.callback = callback
            }

            assets() {
                return {get: (name, params) => ({name, params})}
            }

            handle({name, params}) {
                requests.push({name, params, respond: (asset, error) => this.callback(asset, error)})
                const answered = answer(name)
                if (answered !== undefined) {
                    answered instanceof Error ? this.callback(undefined, answered) : this.callback(answered)
                }
            }
        }
    },
    rpc_convert: {assetIdToAssetName: id => `projects/earthengine-legacy/assets/${id}`}
}

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: ee}))
jest.unstable_mockModule('#gee/jobs/job', () => ({job: config => config}))

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

        expect(value.assets).toEqual([
            {id: 'users/x/image', type: 'IMAGE', version: '2026-10-01T06:23:41.888670Z'},
            {id: 'users/x/collection', type: 'IMAGE_COLLECTION', version: '2026-10-01T06:31:09.600525Z'}
        ])
        expect(requests.map(({params}) => params)).toEqual([{prettyPrint: false}, {prettyPrint: false}])
    })

    it('is asked for once however often the id is repeated', () => {
        const {value} = run(['users/x/image', 'users/x/image'])

        expect(requests).toHaveLength(1)
        expect(value.assets.map(({id}) => id)).toEqual(['users/x/image'])
    })
})

describe('an asset without a version', () => {
    it('is a Cloud GeoTIFF, answered without asking Earth Engine', () => {
        const {value} = run(['gs://bucket/image.tif'])

        expect(requests).toHaveLength(0)
        expect(value.assets).toEqual([{id: 'gs://bucket/image.tif', version: null, unversioned: true}])
    })

    it('is one whose metadata carries no updateTime, and is not a failure', () => {
        answer = () => ({type: 'IMAGE'})

        const {value} = run(['users/x/image'])

        expect(value.assets).toEqual([{id: 'users/x/image', type: 'IMAGE', version: null, unversioned: true}])
    })
})

describe('a failed read', () => {
    it.each([
        ['missing', 'Asset \'x\' does not exist or doesn\'t allow this operation.', 'DEFINITIVE', 'NOT_FOUND'],
        ['not readable by this user', 'Permission denied', 'DEFINITIVE', 'PERMISSION_DENIED'],
        ['anything else', 'Service unavailable', 'TRANSIENT', 'UNAVAILABLE']
    ])('of an asset %s fails that asset alone', (_case, message, kind, code) => {
        answer = name => name === nameOf('users/x/failing') ? new Error(message) : {type: 'IMAGE', updateTime: 'T'}

        const {value, error} = run(['users/x/failing', 'users/x/image'])

        expect(error).toBeUndefined()
        expect(value.assets).toEqual([
            {id: 'users/x/failing', failure: {kind, code}},
            {id: 'users/x/image', type: 'IMAGE', version: 'T'}
        ])
    })
})

describe('a request', () => {
    it('reads at most four assets at once', () => {
        answer = () => undefined
        const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => `users/x/${id}`)

        const result = {}
        worker$({requestArgs: {ids}, credentials: {}}).subscribe(value => result.value = value)
        expect(requests).toHaveLength(4)

        requests[0].respond({type: 'IMAGE', updateTime: 'T'})
        expect(requests).toHaveLength(5)
        requests.slice(1).forEach(request => request.respond({type: 'IMAGE', updateTime: 'T'}))
        requests[5].respond({type: 'IMAGE', updateTime: 'T'})

        expect(result.value.assets.map(({id}) => id)).toEqual(ids)
    })

    it.each([
        ['more than fifty ids', Array.from({length: 51}, (_, i) => `users/x/${i}`)],
        ['an id that is not a string', ['users/x/a', 7]],
        ['no list', undefined]
    ])('with %s is refused before anything is read', (_case, ids) => {
        expect(() => run(ids)).toThrow('Expected at most 50 asset ids')
        expect(requests).toHaveLength(0)
    })
})
