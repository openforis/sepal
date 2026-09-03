import {getPool} from './db.js'
import {withProjectId} from './recipe.js'

const RECIPE = 'recipe'
const PROJECT = 'project'

const placeholders = items => items.map(() => '?').join(', ')

const saveRecipe = async ({id, projectId, name, type, username, contents, typeVersion, creationTime}) => {
    const now = new Date()
    const storedContents = withProjectId(contents, projectId)
    const [result] = await getPool().query(
        `UPDATE ${RECIPE}
         SET type_version = ?, project_id = ?, name = ?, contents = ?, update_time = ?
         WHERE id = ? AND username = ?`,
        [typeVersion, projectId, name, storedContents, now, id, username]
    )
    if (!result.affectedRows) {
        await getPool().query(
            `INSERT INTO ${RECIPE} (id, project_id, name, type, type_version, username, contents, creation_time, update_time)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, projectId, name, type, typeVersion, username, storedContents, creationTime || now, now]
        )
    }
}

const getById = async id => {
    const [rows] = await getPool().query(
        `SELECT id, project_id, name, type, type_version, username, contents, creation_time, update_time
         FROM ${RECIPE} WHERE id = ? AND removed = FALSE`,
        [id]
    )
    return rows[0] || null
}

const listRecipes = async username => {
    const [rows] = await getPool().query(
        `SELECT id, project_id, name, type, type_version, username, creation_time, update_time
         FROM ${RECIPE} WHERE username = ? AND removed = FALSE ORDER BY name, update_time DESC`,
        [username]
    )
    return rows
}

const removeRecipes = async (ids, username) => {
    if (!ids.length) {
        return
    }
    await getPool().query(
        `UPDATE ${RECIPE} SET removed = TRUE WHERE id IN (${placeholders(ids)}) AND username = ?`,
        [...ids, username]
    )
}

const saveProject = async ({id, name, username, defaultAssetFolder, defaultWorkspaceFolder}) => {
    const [result] = await getPool().query(
        `UPDATE ${PROJECT}
         SET name = ?, default_asset_folder = ?, default_workspace_folder = ?
         WHERE id = ? AND username = ?`,
        [name, defaultAssetFolder, defaultWorkspaceFolder, id, username]
    )
    if (!result.affectedRows) {
        await getPool().query(
            `INSERT INTO ${PROJECT} (id, name, username, default_asset_folder, default_workspace_folder)
             VALUES (?, ?, ?, ?, ?)`,
            [id, name, username, defaultAssetFolder, defaultWorkspaceFolder]
        )
    }
}

const removeProject = async (id, username) => {
    await getPool().query(`DELETE FROM ${PROJECT} WHERE id = ? AND username = ?`, [id, username])
    await getPool().query(
        `UPDATE ${RECIPE} SET removed = TRUE WHERE project_id = ? AND username = ?`,
        [id, username]
    )
}

const moveRecipes = async (projectId, recipeIds, username) => {
    if (!recipeIds.length) {
        return
    }
    await getPool().query(
        `UPDATE ${RECIPE} SET project_id = ? WHERE id IN (${placeholders(recipeIds)}) AND username = ?`,
        [projectId, ...recipeIds, username]
    )
}

const listProjects = async username => {
    const [rows] = await getPool().query(
        `SELECT id, name, username, default_asset_folder, default_workspace_folder
         FROM ${PROJECT} WHERE username = ? ORDER BY name`,
        [username]
    )
    return rows
}

const listRecipesOfTypeBeforeVersion = async (type, version) => {
    const [rows] = await getPool().query(
        `SELECT id, project_id, name, type, type_version, username, contents, creation_time, update_time
         FROM ${RECIPE} WHERE type = ? AND type_version < ? AND removed = FALSE ORDER BY creation_time`,
        [type, version]
    )
    return rows
}

const saveMigratedRecipe = async ({id, username, typeVersion, contents}) => {
    await getPool().query(
        `UPDATE ${RECIPE} SET type_version = ?, contents = ? WHERE id = ? AND username = ?`,
        [typeVersion, contents, id, username]
    )
}

export {getById, listProjects, listRecipes, listRecipesOfTypeBeforeVersion, moveRecipes, removeProject, removeRecipes, saveMigratedRecipe, saveProject, saveRecipe}
