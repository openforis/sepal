export {currentVersionForType} from './migration/registry.js'

const toISOString = value => {
    if (value == null) {
        return null
    }
    return new Date(value).toISOString()
}

// A load injects placement and revision from their columns, so a client echoing them back must not be
// allowed to establish a second, staler copy inside the contents it submits.
const contentsWithoutServerMetadata = contents => {
    const parsed = JSON.parse(contents)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('A recipe must be a JSON object')
    }
    delete parsed.revision
    delete parsed.projectId
    return JSON.stringify(parsed)
}

const rowToRecipe = row => ({
    ...JSON.parse(row.contents),
    projectId: row.project_id,
    revision: row.revision
})

const recipeRowToListItem = row => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    type: row.type,
    creationTime: toISOString(row.creation_time),
    updateTime: toISOString(row.update_time),
    revision: row.revision
})

const projectRowToMap = row => ({
    id: row.id,
    name: row.name,
    username: row.username,
    defaultAssetFolder: row.default_asset_folder ?? null,
    defaultWorkspaceFolder: row.default_workspace_folder ?? null
})

export {contentsWithoutServerMetadata, projectRowToMap, recipeRowToListItem, rowToRecipe, toISOString}
