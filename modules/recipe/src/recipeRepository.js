import {storedUsername} from '#sepal/username'

const RECIPE = 'recipe'
const FOLDER = 'folder'
const INITIAL_REVISION = 1

export class RecipeRepository {
    #db

    constructor(db) {
        this.#db = db
    }

    // The conditional update atomically enforces ownership, type, revision and deletion, so a writer whose
    // base revision has moved changes nothing. Folder placement belongs to moveRecipes and must not be
    // overwritten by a retried save.
    async saveRecipe({id, owner, folderId, name, type, typeVersion, content, expectedRevision}) {
        return await this.#db.withTransaction(async connection => {
            const now = new Date()
            if (expectedRevision == null) {
                try {
                    await connection.query(
                        `INSERT INTO ${RECIPE}
                            (id, folder_id, name, type, type_version, username, contents, creation_time, update_time, revision)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [id, folderId, name, type, typeVersion, storedUsername(owner),
                            contentsColumn(content), now, now, INITIAL_REVISION]
                    )
                    return {outcome: 'saved', revision: INITIAL_REVISION}
                } catch (error) {
                    if (error.code !== 'ER_DUP_ENTRY') {
                        throw error
                    } else {
                        return await explainRejection(connection, id, owner, type)
                    }
                }
            } else {
                const nextRevision = expectedRevision + 1
                const [result] = await connection.query(
                    `UPDATE ${RECIPE}
                     SET type_version = ?, name = ?, contents = ?, update_time = ?, revision = ?
                     WHERE id = ? AND username = ? AND type = ? AND revision = ? AND removed = FALSE`,
                    [typeVersion, name, contentsColumn(content), now, nextRevision,
                        id, owner, type, expectedRevision]
                )
                if (result.affectedRows) {
                    return {outcome: 'saved', revision: nextRevision}
                } else {
                    return await explainRejection(connection, id, owner, type)
                }
            }
        })
    }

    async findRecipe(id) {
        return await this.#db.withTransaction(async connection => {
            const [rows] = await connection.query(
                `SELECT username, folder_id, contents, revision
                 FROM ${RECIPE} WHERE id = ? AND removed = FALSE`,
                [id]
            )
            return rows[0] ? {owner: rows[0].username, recipe: toRecipe(rows[0])} : null
        })
    }

    // Summaries never select contents: a listing would otherwise load every stored document.
    async listRecipes(owner) {
        return await this.#db.withTransaction(async connection => {
            const [rows] = await connection.query(
                `SELECT id, folder_id, name, type, creation_time, update_time, revision
                 FROM ${RECIPE} WHERE username = ? AND removed = FALSE ORDER BY name, update_time DESC`,
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
                     WHERE id IN (${placeholders(recipeIds)}) AND username = ?`,
                    [...recipeIds, owner]
                )
            }
        })
    }

    async moveRecipes({folderId, recipeIds, owner}) {
        await this.#db.withTransaction(async connection => {
            if (recipeIds.length) {
                await connection.query(
                    `UPDATE ${RECIPE} SET folder_id = ?
                     WHERE id IN (${placeholders(recipeIds)}) AND username = ?`,
                    [folderId, ...recipeIds, owner]
                )
            }
        })
    }

    async findRecipesToMigrate(type, version) {
        return await this.#db.withTransaction(async connection => {
            const [rows] = await connection.query(
                `SELECT id, username, type_version, contents
                 FROM ${RECIPE} WHERE type = ? AND type_version < ? AND removed = FALSE ORDER BY creation_time`,
                [type, version]
            )
            return rows.map(row => ({
                id: row.id,
                owner: row.username,
                typeVersion: row.type_version,
                content: parsedOrNull(row.contents)
            }))
        })
    }

    // A model migration has no expected revision to carry, so it advances the column in place. An unmatched
    // row is a failure, not a migration silently reported as done.
    async saveMigratedRecipe({id, owner, typeVersion, content}) {
        await this.#db.withTransaction(async connection => {
            const [result] = await connection.query(
                `UPDATE ${RECIPE} SET type_version = ?, contents = ?, revision = revision + 1
                 WHERE id = ? AND username = ?`,
                [typeVersion, contentsColumn(content), id, owner]
            )
            if (result.affectedRows !== 1) {
                throw new Error(`Migrating recipe ${id} updated ${result.affectedRows} rows`)
            }
        })
    }

    async listFolders(owner) {
        return await this.#db.withTransaction(async connection => {
            const [rows] = await connection.query(
                `SELECT id, name, username, parent_id, default_asset_folder, default_workspace_folder
                 FROM ${FOLDER} WHERE username = ? ORDER BY name`,
                [owner]
            )
            return rows.map(toFolder)
        })
    }

    // One statement, so concurrent creates of the same id converge instead of colliding. Each column
    // updates only when the stored row already belongs to the writer, and username is never assigned, so
    // an id someone else owns can be neither taken over nor altered. The parent is resolved and walked in
    // the same transaction as the write, so both read one consistent snapshot.
    async saveFolder({id, owner, name, parentId = null, defaultAssetFolder, defaultWorkspaceFolder}) {
        return await this.#db.withTransaction(async connection => {
            if (parentId && !await ownsFolder(connection, parentId, owner)) {
                return {outcome: 'parentNotFound'}
            } else if (parentId && await descendsFrom(connection, parentId, id, owner)) {
                return {outcome: 'cycle'}
            } else {
                await connection.query(
                    `INSERT INTO ${FOLDER}
                        (id, name, username, parent_id, default_asset_folder, default_workspace_folder)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                         name = IF(username = VALUES(username), VALUES(name), name),
                         parent_id = IF(username = VALUES(username), VALUES(parent_id), parent_id),
                         default_asset_folder =
                             IF(username = VALUES(username), VALUES(default_asset_folder), default_asset_folder),
                         default_workspace_folder =
                             IF(username = VALUES(username), VALUES(default_workspace_folder), default_workspace_folder)`,
                    [id, name, storedUsername(owner), parentId, defaultAssetFolder, defaultWorkspaceFolder]
                )
                return {outcome: 'saved'}
            }
        })
    }

    // Counting and deleting share one transaction: the counts and the delete read one consistent
    // snapshot, and the delete rolls back if anything in the transaction fails.
    async removeFolder(id, owner) {
        return await this.#db.withTransaction(async connection => {
            const [[folders]] = await connection.query(
                `SELECT COUNT(*) AS count FROM ${FOLDER} WHERE parent_id = ? AND username = ?`,
                [id, owner]
            )
            const [[recipes]] = await connection.query(
                `SELECT COUNT(*) AS count FROM ${RECIPE}
                 WHERE folder_id = ? AND username = ? AND removed = FALSE`,
                [id, owner]
            )
            if (folders.count || recipes.count) {
                return {outcome: 'notEmpty', folders: folders.count, recipes: recipes.count}
            } else {
                await connection.query(
                    `DELETE FROM ${FOLDER} WHERE id = ? AND username = ?`, [id, owner]
                )
                return {outcome: 'removed'}
            }
        })
    }
}

// Placement and revision are column-owned, and a load injects them. Every write strips them from the
// document so no caller can leave a second copy behind, stale from the next move or save onward.
const contentsColumn = content => {
    if (!content || typeof content !== 'object' || Array.isArray(content)) {
        throw new Error('A recipe must be a JSON object')
    }
    const stored = withoutLegacyPlacement(content)
    delete stored.revision
    delete stored.folderId
    return JSON.stringify(stored)
}

const ownsFolder = async (connection, id, owner) => {
    const [rows] = await connection.query(
        `SELECT 1 FROM ${FOLDER} WHERE id = ? AND username = ?`, [id, owner]
    )
    return !!rows[0]
}

// Walks from the proposed parent to the root looking for the folder being saved. Ids already seen end
// the walk: a stored chain that revisits one is broken, and stopping beats spinning on it.
const descendsFrom = async (connection, parentId, id, owner) => {
    const visited = new Set()
    let current = parentId
    while (current && !visited.has(current)) {
        if (current === id) {
            return true
        }
        visited.add(current)
        const [rows] = await connection.query(
            `SELECT parent_id FROM ${FOLDER} WHERE id = ? AND username = ?`, [current, owner]
        )
        current = rows[0]?.parent_id ?? null
    }
    return false
}

// Which precondition failed is only knowable from the row. A foreign recipe is reported absent, so
// ownership is never disclosed across the port.
const explainRejection = async (connection, id, owner, type) => {
    const [rows] = await connection.query(
        `SELECT type, revision, removed FROM ${RECIPE} WHERE id = ? AND username = ?`, [id, owner]
    )
    const row = rows[0]
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
    ...withoutLegacyPlacement(JSON.parse(row.contents)),
    folderId: row.folder_id,
    revision: row.revision
})

// Documents written before folders were named folders carry a projectId of their own, which no column
// overwrites any more.
const withoutLegacyPlacement = document => {
    const stored = {...document}
    delete stored.projectId
    return stored
}

const toSummary = row => ({
    id: row.id,
    folderId: row.folder_id,
    name: row.name,
    type: row.type,
    creationTime: row.creation_time,
    updateTime: row.update_time,
    revision: row.revision
})

const placeholders = items => items.map(() => '?').join(', ')

// Only the migration read tolerates a document it cannot parse: it reports the recipe with no content so
// the runner can skip that one and migrate the rest. A query that fails still throws.
const parsedOrNull = contents => {
    try {
        return JSON.parse(contents)
    } catch (_error) {
        return null
    }
}

const toFolder = row => ({
    id: row.id,
    name: row.name,
    username: row.username,
    parentId: row.parent_id ?? null,
    defaultAssetFolder: row.default_asset_folder ?? null,
    defaultWorkspaceFolder: row.default_workspace_folder ?? null
})
