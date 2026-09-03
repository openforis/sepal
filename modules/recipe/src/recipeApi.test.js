import {jest} from '@jest/globals'

const repo = {
    saveRecipe: jest.fn(), getById: jest.fn(), listRecipes: jest.fn(), removeRecipes: jest.fn(),
    saveProject: jest.fn(), removeProject: jest.fn(), moveRecipes: jest.fn(), listProjects: jest.fn()
}
jest.unstable_mockModule('./recipeRepository.js', () => repo)

const api = await import('./recipeApi.js')

const ctx = (over = {}) => ({
    params: {}, query: {}, request: {body: {}}, state: {currentUser: {username: 'bob', roles: []}}, ...over
})

beforeEach(() => Object.values(repo).forEach(fn => fn.mockReset()))

test('loadRecipe returns raw contents with projectId injected', async () => {
    repo.getById.mockResolvedValue({id: 'r1', username: 'bob', project_id: 'p1', contents: '{"model":1,"projectId":"old"}'})
    const c = ctx({params: {id: 'r1'}})
    await api.loadRecipe(c)
    expect(c.body).toBe('{"model":1,"projectId":"p1"}')
})

test('loadRecipe 404 when missing', async () => {
    repo.getById.mockResolvedValue(null)
    const c = ctx({params: {id: 'x'}})
    await api.loadRecipe(c)
    expect(c.status).toBe(404)
})

test('loadRecipe 404 when other user and not admin', async () => {
    repo.getById.mockResolvedValue({id: 'r1', username: 'alice', project_id: null, contents: '{}'})
    const c = ctx({params: {id: 'r1'}})
    await api.loadRecipe(c)
    expect(c.status).toBe(404)
})

test('loadRecipe allows admin to read another user recipe', async () => {
    repo.getById.mockResolvedValue({id: 'r1', username: 'alice', project_id: null, contents: '{"a":1}'})
    const c = ctx({params: {id: 'r1'}, state: {currentUser: {username: 'bob', roles: ['application_admin']}}})
    await api.loadRecipe(c)
    expect(c.body).toBe('{"a":1,"projectId":null}')
})

test('listRecipes returns mapped list items', async () => {
    repo.listRecipes.mockResolvedValue([{id: 'r1', project_id: 'p1', name: 'n', type: 'MOSAIC', creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T21:38:19.000Z'}])
    const c = ctx()
    await api.listRecipes(c)
    expect(c.body).toEqual([{id: 'r1', projectId: 'p1', name: 'n', type: 'MOSAIC', creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T21:38:19.000Z'}])
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
