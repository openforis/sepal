import {currentVersionForType, projectRowToMap, recipeRowToListItem, toISOString, withProjectId} from './recipe.js'

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

test('withProjectId injects projectId into object contents', () => {
    const out = withProjectId('{"model":{"x":1},"projectId":"old"}', 'p1')
    expect(JSON.parse(out)).toEqual({model: {x: 1}, projectId: 'p1'})
})

test('withProjectId passes through non-object contents unchanged', () => {
    expect(withProjectId('"a string"', 'p1')).toBe('"a string"')
    expect(withProjectId('not json', 'p1')).toBe('not json')
})

test('recipeRowToListItem maps columns with ISO timestamps', () => {
    const row = {
        id: 'r1', project_id: 'p1', name: 'My recipe', type: 'MOSAIC',
        creation_time: '2025-05-28T21:38:19.000Z', update_time: '2025-05-28T22:00:00.000Z'
    }
    expect(recipeRowToListItem(row)).toEqual({
        id: 'r1', projectId: 'p1', name: 'My recipe', type: 'MOSAIC',
        creationTime: '2025-05-28T21:38:19.000Z', updateTime: '2025-05-28T22:00:00.000Z'
    })
})

test('projectRowToMap maps folders, null when absent', () => {
    expect(projectRowToMap({id: 'p1', name: 'P', username: 'bob', default_asset_folder: 'a', default_workspace_folder: null}))
        .toEqual({id: 'p1', name: 'P', username: 'bob', defaultAssetFolder: 'a', defaultWorkspaceFolder: null})
})
