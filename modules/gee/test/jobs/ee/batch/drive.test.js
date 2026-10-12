import {jest} from '@jest/globals'
import {lastValueFrom} from 'rxjs'

// What a Drive folder listing returns. The Drive API is substituted by an in-memory tree.

const state = {}

jest.unstable_mockModule('googleapis', () => ({
    google: {
        auth: {OAuth2: class {setCredentials() {}}},
        drive: () => ({files: {list: async params => ({data: list(params)})}})
    }
}))

const {drive} = await import('#gee/jobs/ee/batch/drive')

const ALICE = {username: 'alice', googleTokens: {accessToken: 'a', accessTokenExpiryDate: Date.now() + 3600000}}

beforeEach(() => {
    state.folders = [
        {id: 'sepal', name: 'SEPAL'},
        {id: 'exports', name: 'exports', parent: 'sepal'},
        {id: 'f1', name: 'f1', parent: 'exports'}
    ]
    state.pages = {}
})

test('a folder listing gathers the files of every page', async () => {
    state.pages.f1 = [
        {files: [{id: 'a', name: 'a.tif', size: '1'}], nextPageToken: 'page-2'},
        {files: [{id: 'b', name: 'b.tif', size: '2'}]}
    ]

    const files = await lastValueFrom(drive({sepalUser: ALICE}).listFiles$({path: 'SEPAL/exports/f1'}))

    expect(files).toEqual([{id: 'a', name: 'a.tif', size: '1'}, {id: 'b', name: 'b.tif', size: '2'}])
})

test('an empty folder lists no files', async () => {
    state.pages.f1 = [{files: []}]

    const files = await lastValueFrom(drive({sepalUser: ALICE}).listFiles$({path: 'SEPAL/exports/f1'}))

    expect(files).toEqual([])
})

test('a path with an empty name in it matches no folder', async () => {
    state.pages.f1 = [{files: [{id: 'a', name: 'a.tif', size: '1'}]}]

    await expect(lastValueFrom(drive({sepalUser: ALICE}).listFiles$({path: 'SEPAL/exports/'}))).rejects.toMatchObject({statusCode: 404})
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
