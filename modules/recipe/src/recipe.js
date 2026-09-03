export {currentVersionForType} from './migration/registry.js'

const toISOString = value => {
    if (value == null) {
        return null
    }
    return new Date(value).toISOString()
}

const withProjectId = (contents, projectId) => {
    if (contents == null) {
        return contents
    }
    let parsed
    try {
        parsed = JSON.parse(contents)
    } catch (_error) {
        return contents
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        parsed.projectId = projectId
        return JSON.stringify(parsed)
    }
    return contents
}

const recipeRowToListItem = row => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    type: row.type,
    creationTime: toISOString(row.creation_time),
    updateTime: toISOString(row.update_time)
})

const projectRowToMap = row => ({
    id: row.id,
    name: row.name,
    username: row.username,
    defaultAssetFolder: row.default_asset_folder ?? null,
    defaultWorkspaceFolder: row.default_workspace_folder ?? null
})

export {projectRowToMap, recipeRowToListItem, toISOString, withProjectId}
