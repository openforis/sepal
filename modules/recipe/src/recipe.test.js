import {contentsWithoutServerMetadata, currentVersionForType, projectRowToMap, recipeRowToListItem, rowToRecipe, toISOString} from './recipe.js'

test('toISOString returns standard ISO 8601, null-safe', () => {
    expect(toISOString('2025-05-28T21:38:19.000Z')).toBe('2025-05-28T21:38:19.000Z')
    expect(toISOString(null)).toBeNull()
})

test('currentVersionForType locks all registry-derived versions against drift', () => {
    expect(currentVersionForType('MOSAIC')).toBe(8)
    expect(currentVersionForType('RADAR_MOSAIC')).toBe(5)
    expect(currentVersionForType('CLASSIFICATION')).toBe(5)
    expect(currentVersionForType('CHANGE_DETECTION')).toBe(2)
    expect(currentVersionForType('TIME_SERIES')).toBe(8)
    expect(currentVersionForType('CCDC')).toBe(8)
    expect(currentVersionForType('CCDC_SLICE')).toBe(2)
    expect(currentVersionForType('REMAPPING')).toBe(2)
    expect(currentVersionForType('CHANGE_ALERTS')).toBe(8)
    expect(currentVersionForType('PHENOLOGY')).toBe(8)
    expect(currentVersionForType('UNKNOWN_TYPE')).toBe(1)
})

test('contentsWithoutServerMetadata strips a submitted revision and projectId', () => {
    expect(JSON.parse(contentsWithoutServerMetadata('{"model":{"x":1},"revision":99,"projectId":"old"}')))
        .toEqual({model: {x: 1}})
})

test('contentsWithoutServerMetadata rejects contents that are not a recipe object', () => {
    expect(() => contentsWithoutServerMetadata('"a string"')).toThrow()
    expect(() => contentsWithoutServerMetadata('not json')).toThrow()
})

test('rowToRecipe injects projectId and revision from their columns', () => {
    const row = {project_id: 'p1', revision: 4, contents: '{"model":{"x":1},"projectId":"old","revision":99}'}
    expect(rowToRecipe(row)).toEqual({model: {x: 1}, projectId: 'p1', revision: 4})
})

test('recipeRowToListItem maps columns with ISO timestamps', () => {
    const row = {
        id: 'r1', project_id: 'p1', name: 'My recipe', type: 'MOSAIC', revision: 3,
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T22:00:00.000Z'
    }
    expect(recipeRowToListItem(row)).toEqual({
        id: 'r1', projectId: 'p1', name: 'My recipe', type: 'MOSAIC', revision: 3,
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T22:00:00.000Z'
    })
})

test('projectRowToMap maps folders, null when absent', () => {
    expect(projectRowToMap({id: 'p1', name: 'P', username: 'bob', default_asset_folder: 'a', default_workspace_folder: null}))
        .toEqual({id: 'p1', name: 'P', username: 'bob', defaultAssetFolder: 'a', defaultWorkspaceFolder: null})
})
