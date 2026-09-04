import {jest} from '@jest/globals'
import {Readable} from 'stream'
import {gzipSync} from 'zlib'

const repo = {
    saveRecipe: jest.fn(), getById: jest.fn(), listRecipes: jest.fn(), removeRecipes: jest.fn(),
    saveProject: jest.fn(), removeProject: jest.fn(), moveRecipes: jest.fn(), listProjects: jest.fn()
}
jest.unstable_mockModule('./recipeRepository.js', () => repo)

const api = await import('./recipeApi.js')

const ctx = (over = {}) => ({
    params: {}, query: {}, request: {body: {}}, headers: {},
    state: {currentUser: {username: 'bob', roles: []}}, set: () => {}, ...over
})

beforeEach(() => Object.values(repo).forEach(fn => fn.mockReset()))

test('loadRecipe returns the flat recipe with projectId and revision from their columns', async () => {
    repo.getById.mockResolvedValue({
        id: 'r1', username: 'bob', project_id: 'p1', revision: 4,
        contents: '{"model":1,"projectId":"old","revision":99}'
    })
    const c = ctx({params: {id: 'r1'}})
    await api.loadRecipe(c)
    expect(c.body).toEqual({model: 1, projectId: 'p1', revision: 4})
})

test('loadRecipe 404 when missing', async () => {
    repo.getById.mockResolvedValue(null)
    const c = ctx({params: {id: 'x'}})
    await api.loadRecipe(c)
    expect(c.status).toBe(404)
})

test('loadRecipe 404 when other user and not admin', async () => {
    repo.getById.mockResolvedValue({id: 'r1', username: 'alice', project_id: null, revision: 1, contents: '{}'})
    const c = ctx({params: {id: 'r1'}})
    await api.loadRecipe(c)
    expect(c.status).toBe(404)
})

test('loadRecipe allows admin to read another user recipe', async () => {
    repo.getById.mockResolvedValue({id: 'r1', username: 'alice', project_id: null, revision: 2, contents: '{"a":1}'})
    const c = ctx({params: {id: 'r1'}, state: {currentUser: {username: 'bob', roles: ['application_admin']}}})
    await api.loadRecipe(c)
    expect(c.body).toEqual({a: 1, projectId: null, revision: 2})
})

test('listRecipes returns mapped list items', async () => {
    repo.listRecipes.mockResolvedValue([{id: 'r1', project_id: 'p1', name: 'n', type: 'MOSAIC', revision: 2, creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z'}])
    const c = ctx()
    await api.listRecipes(c)
    expect(c.body).toEqual([{id: 'r1', projectId: 'p1', name: 'n', type: 'MOSAIC', revision: 2, creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z'}])
})

test('removeRecipes removes by body id list then returns the list', async () => {
    repo.listRecipes.mockResolvedValue([])
    const c = ctx({request: {body: ['a', 'b']}})
    await api.removeRecipes(c)
    expect(repo.removeRecipes).toHaveBeenCalledWith(['a', 'b'], 'bob')
    expect(c.body).toEqual([])
})

test('moveRecipes uses path projectId + body recipe ids', async () => {
    repo.listRecipes.mockResolvedValue([])
    const c = ctx({params: {id: 'p1'}, request: {body: ['a', 'b']}})
    await api.moveRecipes(c)
    expect(repo.moveRecipes).toHaveBeenCalledWith('p1', ['a', 'b'], 'bob')
})

test('saveProject reads form body and returns project list', async () => {
    repo.listProjects.mockResolvedValue([{id: 'p1', name: 'P', username: 'bob', default_asset_folder: null, default_workspace_folder: null}])
    const c = ctx({request: {body: {id: 'p1', name: 'P', defaultAssetFolder: 'a', defaultWorkspaceFolder: 'w'}}})
    await api.saveProject(c)
    expect(repo.saveProject).toHaveBeenCalledWith({id: 'p1', name: 'P', username: 'bob', defaultAssetFolder: 'a', defaultWorkspaceFolder: 'w'})
    expect(c.body).toEqual([{id: 'p1', name: 'P', username: 'bob', defaultAssetFolder: null, defaultWorkspaceFolder: null}])
})

const gzippedBody = contents => {
    const stream = new Readable({read() {}})
    stream.push(gzipSync(Buffer.from(contents, 'utf8')))
    stream.push(null)
    return stream
}

const saveCtx = (over = {}) => {
    const headers = {}
    return {
        ...ctx(over),
        req: gzippedBody('{"model":1}'),
        set: (key, value) => headers[key] = value,
        responseHeaders: headers
    }
}

test('listRecipes exposes revision and forbids caching the revision vector', async () => {
    repo.listRecipes.mockResolvedValue([{
        id: 'r1', project_id: 'p1', name: 'n', type: 'MOSAIC', revision: 7,
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z'
    }])
    const c = saveCtx()
    await api.listRecipes(c)
    expect(c.body[0].revision).toBe(7)
    expect(c.responseHeaders['Cache-Control']).toBe('no-store')
})

test('loadRecipe forbids caching the revision it returns', async () => {
    repo.getById.mockResolvedValue({id: 'r1', username: 'bob', project_id: 'p1', revision: 4, contents: '{"model":1}'})
    const c = saveCtx({params: {id: 'r1'}})
    await api.loadRecipe(c)
    expect(c.responseHeaders['Cache-Control']).toBe('no-store')
})

// Malformed revisions must not enter the create path reserved for an absent precondition.
describe('the expected revision', () => {
    test('absent means create', async () => {
        repo.saveRecipe.mockResolvedValue({revision: 1})
        const c = saveCtx({params: {id: 'r1'}, query: {type: 'MOSAIC'}})
        await api.saveRecipe(c)
        expect(repo.saveRecipe).toHaveBeenCalledWith(expect.objectContaining({expectedRevision: undefined}))
        expect(c.body).toEqual({revision: 1})
    })

    test('a positive integer means update', async () => {
        repo.saveRecipe.mockResolvedValue({revision: 5})
        const c = saveCtx({params: {id: 'r1'}, query: {type: 'MOSAIC', expectedRevision: '4'}})
        await api.saveRecipe(c)
        expect(repo.saveRecipe).toHaveBeenCalledWith(expect.objectContaining({expectedRevision: 4}))
        expect(c.body).toEqual({revision: 5})
    })

    test.each(['abc', '0', '1.5', '-1', ''])('%p is rejected without reaching storage', async value => {
        const c = saveCtx({params: {id: 'r1'}, query: {type: 'MOSAIC', expectedRevision: value}})
        await api.saveRecipe(c)
        expect(c.status).toBe(400)
        expect(c.body).toEqual({code: 'INVALID_EXPECTED_REVISION'})
        expect(repo.saveRecipe).not.toHaveBeenCalled()
    })
})

// Empty query values must match the null project representation a load returns.
test('saveRecipe normalizes an empty project id to null', async () => {
    repo.saveRecipe.mockResolvedValue({revision: 1})
    const c = saveCtx({params: {id: 'r1'}, query: {type: 'MOSAIC', projectId: ''}})
    await api.saveRecipe(c)
    expect(repo.saveRecipe).toHaveBeenCalledWith(expect.objectContaining({projectId: null}))
})

test.each([
    ['CONFLICT', 412, 'RECIPE_REVISION_CONFLICT'],
    ['TYPE_MISMATCH', 409, 'RECIPE_TYPE_MISMATCH']
])('saveRecipe maps %s to %i with a stable code', async (error, status, code) => {
    repo.saveRecipe.mockResolvedValue({error, currentRevision: 9})
    const c = saveCtx({params: {id: 'r1'}, query: {expectedRevision: '4'}})
    await api.saveRecipe(c)
    expect(c.status).toBe(status)
    expect(c.body).toEqual(expect.objectContaining({code}))
})

test('saveRecipe reports a foreign or missing recipe as 404 with no body', async () => {
    repo.saveRecipe.mockResolvedValue({error: 'NOT_FOUND'})
    const c = saveCtx({params: {id: 'r1'}, query: {expectedRevision: '4'}})
    await api.saveRecipe(c)
    expect(c.status).toBe(404)
    expect(c.body).toBeUndefined()
})
