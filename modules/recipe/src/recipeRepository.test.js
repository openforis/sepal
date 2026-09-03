import {jest} from '@jest/globals'

const query = jest.fn()
jest.unstable_mockModule('./db.js', () => ({getPool: () => ({query})}))

const {listRecipesOfTypeBeforeVersion, moveRecipes, removeRecipes, removeProject, saveMigratedRecipe} = await import('./recipeRepository.js')

beforeEach(() => query.mockReset().mockResolvedValue([{affectedRows: 1}, []]))

test('removeRecipes soft-deletes by id list scoped to username', async () => {
    await removeRecipes(['a', 'b'], 'bob')
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/UPDATE recipe/i)
    expect(sql).toMatch(/removed\s*=\s*TRUE/i)
    expect(sql).toMatch(/IN \(\?, \?\)/)
    expect(params).toEqual(['a', 'b', 'bob'])
})

test('moveRecipes sets project_id for the id list scoped to username', async () => {
    await moveRecipes('p1', ['a', 'b'], 'bob')
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/UPDATE recipe SET project_id = \?/i)
    expect(sql).toMatch(/IN \(\?, \?\)/)
    expect(params).toEqual(['p1', 'a', 'b', 'bob'])
})

test('removeProject deletes the project then soft-deletes its recipes', async () => {
    await removeProject('p1', 'bob')
    const [delSql, delParams] = query.mock.calls[0]
    const [updSql, updParams] = query.mock.calls[1]
    expect(delSql).toMatch(/DELETE FROM project WHERE id = \? AND username = \?/i)
    expect(delParams).toEqual(['p1', 'bob'])
    expect(updSql).toMatch(/UPDATE recipe SET removed = TRUE WHERE project_id = \? AND username = \?/i)
    expect(updParams).toEqual(['p1', 'bob'])
})

test('listRecipesOfTypeBeforeVersion selects non-removed rows by type below version', async () => {
    query.mockResolvedValueOnce([[{id: 'r1'}], []])
    const rows = await listRecipesOfTypeBeforeVersion('MOSAIC', 8)
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/SELECT.*FROM recipe WHERE type = \? AND type_version < \? AND removed = FALSE/is)
    expect(sql).toMatch(/ORDER BY creation_time/i)
    expect(params).toEqual(['MOSAIC', 8])
    expect(rows).toEqual([{id: 'r1'}])
})

test('saveMigratedRecipe updates type_version and contents scoped to id and username', async () => {
    await saveMigratedRecipe({id: 'r1', username: 'bob', typeVersion: 8, contents: '{"x":1}'})
    const [sql, params] = query.mock.calls[0]
    expect(sql).toMatch(/UPDATE recipe SET type_version = \?, contents = \? WHERE id = \? AND username = \?/i)
    expect(params).toEqual([8, '{"x":1}', 'r1', 'bob'])
})
