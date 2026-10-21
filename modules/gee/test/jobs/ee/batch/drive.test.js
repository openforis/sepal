import assert from 'node:assert/strict'
import {beforeEach, mock, test} from 'node:test'

import {lastValueFrom} from 'rxjs'

// What a Drive folder listing returns. The Drive API is substituted by an in-memory tree.

const state = {}

mock.module('googleapis', {
    exports: {
        google: {
            auth: {OAuth2: class {setCredentials() {}}},
            drive: () => ({files: {list: async params => {
                if (state.failures-- > 0) throw Object.assign(new Error('Backend Error'), {code: 503})
                return {data: list(params)}
            }}})
        }
    }
})

const {drive} = await import('#gee/jobs/ee/batch/drive')

const ALICE = {username: 'alice', googleTokens: {accessToken: 'a', accessTokenExpiryDate: Date.now() + 3600000}}

beforeEach(() => {
    state.folders = [
        {id: 'sepal', name: 'SEPAL'},
        {id: 'exports', name: 'exports', parent: 'sepal'},
        {id: 'f1', name: 'f1', parent: 'exports'}
    ]
    state.pages = {}
    state.failures = 0
})

test('a folder listing gathers the files of every page', async () => {
    state.pages.f1 = [
        {files: [{id: 'a', name: 'a.tif', size: '1'}], nextPageToken: 'page-2'},
        {files: [{id: 'b', name: 'b.tif', size: '2'}]}
    ]

    const files = await lastValueFrom(drive({sepalUser: ALICE}).listFiles$({path: 'SEPAL/exports/f1'}))

    assert.deepEqual(
        files,
        [{id: 'a', name: 'a.tif', size: '1'}, {id: 'b', name: 'b.tif', size: '2'}]
    )
})

test('an empty folder lists no files', async () => {
    state.pages.f1 = [{files: []}]

    const files = await lastValueFrom(drive({sepalUser: ALICE}).listFiles$({path: 'SEPAL/exports/f1'}))

    assert.deepEqual(files, [])
})

test('a path with an empty name in it matches no folder', async () => {
    state.pages.f1 = [{files: [{id: 'a', name: 'a.tif', size: '1'}]}]

    await assert.rejects(
        lastValueFrom(drive({sepalUser: ALICE}).listFiles$({path: 'SEPAL/exports/'})),
        {statusCode: 404}
    )
})

test('a transient Drive failure is retried with a fresh request', async () => {
    state.pages.f1 = [{files: [{id: 'a', name: 'a.tif', size: '1'}]}]
    state.failures = 1

    const files = await lastValueFrom(drive({sepalUser: ALICE}).listFiles$({path: 'SEPAL/exports/f1'}))

    assert.deepEqual(files, [{id: 'a', name: 'a.tif', size: '1'}])
})

// A query without a name condition matches every folder under the parent, as Drive does.
const list = ({q, pageToken}) => {
    const parent = q.match(/"([^"]+)" in parents/)?.[1]
    const name = q.match(/name = "([^"]*)"/)?.[1]
    if (q.includes('mimeType = "application/vnd.google-apps.folder"')) {
        return {files: state.folders.filter(folder => (name === undefined || folder.name === name) && folder.parent === parent)}
    }
    const pages = state.pages[parent]
    return pages[pageToken ? pages.findIndex((_page, i) => pages[i - 1]?.nextPageToken === pageToken) : 0]
}
