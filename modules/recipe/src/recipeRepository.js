import {getPool} from './db.js'
import {contentsWithoutServerMetadata} from './recipe.js'

const RECIPE = 'recipe'
const PROJECT = 'project'
const INITIAL_REVISION = 1

const createRecipeRepository = (pool = null) => {

    // The conditional update atomically enforces ownership, type, revision and deletion, so a writer whose
    // base revision has moved changes nothing. Project placement belongs to moveRecipes and must not be
    // overwritten by a retried save.
    const saveRecipe = async ({id, projectId, name, type, username, contents, typeVersion, expectedRevision}) => {
        const now = new Date()
        if (expectedRevision == null) {
            try {
                await db().query(
                    `INSERT INTO ${RECIPE}
                        (id, project_id, name, type, type_version, username, contents, creation_time, update_time, revision)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [id, projectId, name, type, typeVersion, username,
                        contentsWithoutServerMetadata(contents), now, now, INITIAL_REVISION]
                )
                return {revision: INITIAL_REVISION}
            } catch (error) {
                if (error.code !== 'ER_DUP_ENTRY') {
                    throw error
                } else {
                    return await explainRejection(id, username, type)
                }
            }
        } else {
            const nextRevision = expectedRevision + 1
            const [result] = await db().query(
                `UPDATE ${RECIPE}
                 SET type_version = ?, name = ?, contents = ?, update_time = ?, revision = ?
                 WHERE id = ? AND username = ? AND type = ? AND revision = ? AND removed = FALSE`,
                [typeVersion, name, contentsWithoutServerMetadata(contents), now, nextRevision,
                    id, username, type, expectedRevision]
            )
            if (result.affectedRows) {
                return {revision: nextRevision}
            } else {
                return await explainRejection(id, username, type)
            }
        }
    }

    const getById = async id => {
        const [rows] = await db().query(
            `SELECT id, project_id, name, type, type_version, username, contents, creation_time, update_time, revision
             FROM ${RECIPE} WHERE id = ? AND removed = FALSE`,
            [id]
        )
        return rows[0] || null
    }

    const listRecipes = async username => {
        const [rows] = await db().query(
            `SELECT id, project_id, name, type, type_version, username, creation_time, update_time, revision
             FROM ${RECIPE} WHERE username = ? AND removed = FALSE ORDER BY name, update_time DESC`,
            [username]
        )
        return rows
    }

    // A removed recipe is authoritatively absent, so advancing its unreadable revision would add no evidence.
    const removeRecipes = async (ids, username) => {
        if (!ids.length) {
            return
        }
        await db().query(
            `UPDATE ${RECIPE} SET removed = TRUE WHERE id IN (${placeholders(ids)}) AND username = ?`,
            [...ids, username]
        )
    }

    // Project placement is independent of content revisions; recipe saves therefore never write it back.
    const moveRecipes = async (projectId, recipeIds, username) => {
        if (!recipeIds.length) {
            return
        }
        await db().query(
            `UPDATE ${RECIPE} SET project_id = ? WHERE id IN (${placeholders(recipeIds)}) AND username = ?`,
            [projectId, ...recipeIds, username]
        )
    }

    const listRecipesOfTypeBeforeVersion = async (type, version) => {
        const [rows] = await db().query(
            `SELECT id, project_id, name, type, type_version, username, contents, creation_time, update_time
             FROM ${RECIPE} WHERE type = ? AND type_version < ? AND removed = FALSE ORDER BY creation_time`,
            [type, version]
        )
        return rows
    }

    // A model migration has no expected revision to carry, so it advances the column in place. An unmatched
    // row is a failure, not a migration silently reported as done.
    const saveMigratedRecipe = async ({id, username, typeVersion, contents}) => {
        const [result] = await db().query(
            `UPDATE ${RECIPE} SET type_version = ?, contents = ?, revision = revision + 1
             WHERE id = ? AND username = ?`,
            [typeVersion, contentsWithoutServerMetadata(contents), id, username]
        )
        if (result.affectedRows !== 1) {
            throw new Error(`Migrating recipe ${id} updated ${result.affectedRows} rows`)
        }
    }

    const saveProject = async ({id, name, username, defaultAssetFolder, defaultWorkspaceFolder}) => {
        const [result] = await db().query(
            `UPDATE ${PROJECT}
             SET name = ?, default_asset_folder = ?, default_workspace_folder = ?
             WHERE id = ? AND username = ?`,
            [name, defaultAssetFolder, defaultWorkspaceFolder, id, username]
        )
        if (!result.affectedRows) {
            await db().query(
                `INSERT INTO ${PROJECT} (id, name, username, default_asset_folder, default_workspace_folder)
                 VALUES (?, ?, ?, ?, ?)`,
                [id, name, username, defaultAssetFolder, defaultWorkspaceFolder]
            )
        }
    }

    const listProjects = async username => {
        const [rows] = await db().query(
            `SELECT id, name, username, default_asset_folder, default_workspace_folder
             FROM ${PROJECT} WHERE username = ? ORDER BY name`,
            [username]
        )
        return rows
    }

    const removeProject = async (id, username) => {
        await db().query(`DELETE FROM ${PROJECT} WHERE id = ? AND username = ?`, [id, username])
        await db().query(
            `UPDATE ${RECIPE} SET removed = TRUE WHERE project_id = ? AND username = ?`,
            [id, username]
        )
    }

    // Do not distinguish missing, removed or foreign recipes across the API boundary.
    const explainRejection = async (id, username, type) => {
        const [rows] = await db().query(
            `SELECT username, type, revision, removed FROM ${RECIPE} WHERE id = ?`, [id]
        )
        const row = rows[0]
        if (!row || row.removed || row.username !== username) {
            return {error: 'NOT_FOUND'}
        } else if (row.type !== type) {
            return {error: 'TYPE_MISMATCH', currentRevision: row.revision}
        } else {
            return {error: 'CONFLICT', currentRevision: row.revision}
        }
    }

    const placeholders = items => items.map(() => '?').join(', ')

    const db = () => pool ?? getPool()

    return {
        getById, listProjects, listRecipes, listRecipesOfTypeBeforeVersion, moveRecipes, removeProject,
        removeRecipes, saveMigratedRecipe, saveProject, saveRecipe
    }
}

export const {
    getById, listProjects, listRecipes, listRecipesOfTypeBeforeVersion, moveRecipes, removeProject,
    removeRecipes, saveMigratedRecipe, saveProject, saveRecipe
} = createRecipeRepository()

export {createRecipeRepository}
