import {storedUsername} from '#sepal/username'

const RECIPE = 'recipe'
const PROJECT = 'project'
const INITIAL_REVISION = 1
// Names sort as people read them: letters first, with case and accents only breaking ties.
const NAME_ORDER = '"und-x-icu"'

export class RecipeRepository {
    #db

    constructor(db) {
        this.#db = db
    }

    // The conditional update atomically enforces ownership, type, revision and deletion, so a writer whose
    // base revision has moved changes nothing. Project placement belongs to moveRecipes and must not be
    // overwritten by a retried save.
    async saveRecipe({id, owner, projectId, name, type, typeVersion, content, expectedRevision}) {
        return await this.#db.withTransaction(async connection => {
            const now = new Date()
            if (expectedRevision == null) {
                // An existing id is left alone rather than raising a duplicate key: a failed statement would
                // abort the transaction before the rejection could be explained.
                const {rowCount} = await connection.query(
                    `INSERT INTO ${RECIPE}
                        (id, project_id, name, type, type_version, username, contents, creation_time, update_time, revision)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                     ON CONFLICT (id) DO NOTHING`,
                    [id, projectId, name, type, typeVersion, storedUsername(owner),
                        contentsColumn(content), now, now, INITIAL_REVISION]
                )
                if (rowCount) {
                    return {outcome: 'saved', revision: INITIAL_REVISION}
                } else {
                    return await explainRejection(connection, id, owner, type)
                }
            } else {
                const nextRevision = expectedRevision + 1
                const {rowCount} = await connection.query(
                    `UPDATE ${RECIPE}
                     SET type_version = $1, name = $2, contents = $3, update_time = $4, revision = $5
                     WHERE id = $6 AND username = $7 AND type = $8 AND revision = $9 AND removed = FALSE`,
                    [typeVersion, name, contentsColumn(content), now, nextRevision,
                        id, owner, type, expectedRevision]
                )
                if (rowCount) {
                    return {outcome: 'saved', revision: nextRevision}
                } else {
                    return await explainRejection(connection, id, owner, type)
                }
            }
        })
    }

    async findRecipe(id) {
        return await this.#db.withTransaction(async connection => {
            const {rows} = await connection.query(
                `SELECT username, project_id, contents, revision
                 FROM ${RECIPE} WHERE id = $1 AND removed = FALSE`,
                [id]
            )
            return rows[0] ? {owner: rows[0].username, recipe: toRecipe(rows[0])} : null
        })
    }

    // Summaries never select contents: a listing would otherwise load every stored document.
    async listRecipes(owner) {
        return await this.#db.withTransaction(async connection => {
            const {rows} = await connection.query(
                `SELECT id, project_id, name, type, creation_time, update_time, revision
                 FROM ${RECIPE} WHERE username = $1 AND removed = FALSE
                 ORDER BY name COLLATE ${NAME_ORDER}, update_time DESC`,
                [owner]
            )
            return rows.map(toSummary)
        })
    }

    // A removed recipe is authoritatively absent, so advancing its unreadable revision would add no evidence.
    async removeRecipes(recipeIds, owner) {
        await this.#db.withTransaction(async connection => {
            if (recipeIds.length) {
                await connection.query(
                    `UPDATE ${RECIPE} SET removed = TRUE
                     WHERE id = ANY($1) AND username = $2`,
                    [recipeIds, owner]
                )
            }
        })
    }

    async moveRecipes({projectId, recipeIds, owner}) {
        await this.#db.withTransaction(async connection => {
            if (recipeIds.length) {
                await connection.query(
                    `UPDATE ${RECIPE} SET project_id = $1
                     WHERE id = ANY($2) AND username = $3`,
                    [projectId, recipeIds, owner]
                )
            }
        })
    }

    async findRecipesToMigrate(type, version) {
        return await this.#db.withTransaction(async connection => {
            const {rows} = await connection.query(
                `SELECT id, username, type_version, contents
                 FROM ${RECIPE} WHERE type = $1 AND type_version < $2 AND removed = FALSE ORDER BY creation_time`,
                [type, version]
            )
            return rows.map(row => ({
                id: row.id,
                owner: row.username,
                typeVersion: row.type_version,
                content: row.contents
            }))
        })
    }

    // A model migration has no expected revision to carry, so it advances the column in place. An unmatched
    // row is a failure, not a migration silently reported as done.
    async saveMigratedRecipe({id, owner, typeVersion, content}) {
        await this.#db.withTransaction(async connection => {
            const {rowCount} = await connection.query(
                `UPDATE ${RECIPE} SET type_version = $1, contents = $2, revision = revision + 1
                 WHERE id = $3 AND username = $4`,
                [typeVersion, contentsColumn(content), id, owner]
            )
            if (rowCount !== 1) {
                throw new Error(`Migrating recipe ${id} updated ${rowCount} rows`)
            }
        })
    }

    async listProjects(owner) {
        return await this.#db.withTransaction(async connection => {
            const {rows} = await connection.query(
                `SELECT id, name, username, default_asset_folder, default_workspace_folder
                 FROM ${PROJECT} WHERE username = $1 ORDER BY name COLLATE ${NAME_ORDER}`,
                [owner]
            )
            return rows.map(toProject)
        })
    }

    // One statement, so concurrent creates of the same id converge instead of colliding. The update applies
    // only when the stored row already belongs to the writer, and username is never assigned, so an id
    // someone else owns can be neither taken over nor altered.
    async saveProject({id, owner, name, defaultAssetFolder, defaultWorkspaceFolder}) {
        await this.#db.withTransaction(async connection => {
            await connection.query(
                `INSERT INTO ${PROJECT} (id, name, username, default_asset_folder, default_workspace_folder)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (id) DO UPDATE SET
                     name = EXCLUDED.name,
                     default_asset_folder = EXCLUDED.default_asset_folder,
                     default_workspace_folder = EXCLUDED.default_workspace_folder
                 WHERE ${PROJECT}.username = EXCLUDED.username`,
                [id, name, storedUsername(owner), defaultAssetFolder, defaultWorkspaceFolder]
            )
        })
    }

    // Removing the project and hiding the recipes it held is one fact in two statements. Half-applied,
    // it leaves recipes pointing at a project id that no longer resolves.
    async removeProject(id, owner) {
        await this.#db.withTransaction(async connection => {
            await connection.query(`DELETE FROM ${PROJECT} WHERE id = $1 AND username = $2`, [id, owner])
            await connection.query(
                `UPDATE ${RECIPE} SET removed = TRUE WHERE project_id = $1 AND username = $2`,
                [id, owner]
            )
        })
    }
}

// Placement and revision are column-owned, and a load injects them. Every write strips them from the
// document so no caller can leave a second copy behind, stale from the next move or save onward.
const contentsColumn = content => {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw new Error('A recipe must be a JSON object')
    }
    const stored = {...content}
    delete stored.revision
    delete stored.projectId
    return stored
}

// Which precondition failed is only knowable from the row. A foreign recipe is reported absent, so
// ownership is never disclosed across the port.
const explainRejection = async (connection, id, owner, type) => {
    const {rows: [row]} = await connection.query(
        `SELECT type, revision, removed FROM ${RECIPE} WHERE id = $1 AND username = $2`, [id, owner]
    )
    if (!row || row.removed) {
        return {outcome: 'notFound'}
    } else if (row.type !== type) {
        return {outcome: 'typeMismatch', currentRevision: row.revision}
    } else {
        return {outcome: 'conflict', currentRevision: row.revision}
    }
}

// The columns are authoritative for placement and revision, so they override whatever a document
// stored before they were stripped happens to carry.
const toRecipe = row => ({
    ...row.contents,
    projectId: row.project_id,
    revision: row.revision
})

const toSummary = row => ({
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    type: row.type,
    creationTime: row.creation_time,
    updateTime: row.update_time,
    revision: row.revision
})

const toProject = row => ({
    id: row.id,
    name: row.name,
    username: row.username,
    defaultAssetFolder: row.default_asset_folder ?? null,
    defaultWorkspaceFolder: row.default_workspace_folder ?? null
})
