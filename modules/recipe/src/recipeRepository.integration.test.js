import {readFileSync} from 'fs'
import {join} from 'path'

import {createConnection, createPool, createTransactionRunner} from '#sepal/db/mysql'
import {dirName} from '#sepal/path'

import {RecipeRepository} from './recipeRepository.js'

// Mocked SQL cannot prove that the conditional update is atomic under concurrent MySQL writers.

const {MYSQL_PASSWORD} = process.env
const SCRATCH = `recipe_test_${process.pid}`
const LEGACY = `${SCRATCH}_legacy`

const describeIf = (condition, ...args) =>
    condition ? describe(...args) : describe.skip(...args)

describeIf(Boolean(MYSQL_PASSWORD), 'integration — recipe repository (requires MYSQL_PASSWORD)', () => {
    let adminConnection
    let scratchPool
    let repository

    beforeAll(async () => {
        adminConnection = await createConnection('mysql', {multipleStatements: true})
        await createScratchSchema(adminConnection)
        scratchPool = await createPool(SCRATCH)
        repository = new RecipeRepository(createTransactionRunner(scratchPool))
    })

    beforeEach(() => clearScratchTables())

    afterAll(() => removeScratchSchema())

    describe('saveRecipe', () => {
        test('creates at column revision 1, storing the content it was given', async () => {
            const recipe = aRecipe()

            const result = await repository.saveRecipe(recipe)

            expect(result).toEqual({outcome: 'saved', revision: 1})
            expect(await storedRow(recipe.id)).toEqual({revision: 1, contents: recipe.content})
        })

        // A client may echo back the placement and revision a load injected; neither may reach the column.
        test('strips server metadata a client echoed back when creating', async () => {
            const content = aRecipeContent()
            const recipe = aRecipe({content: {...content, revision: 97, projectId: 'echoed-project'}})

            await repository.saveRecipe(recipe)

            expect((await storedRow(recipe.id)).contents).toEqual(content)
        })

        test('strips server metadata a client echoed back when updating', async () => {
            const content = aRecipeContent({updated: true})
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            const updatedRecipe = aRecipe({
                expectedRevision: revision, content: {...content, revision: 97, projectId: 'echoed-project'}
            })

            await repository.saveRecipe(updatedRecipe)

            expect((await storedRow(recipe.id)).contents).toEqual(content)
        })

        test.each([['a string'], [[1, 2]]])('refuses %p, which is not a recipe object', async content => {
            const notAnObject = repository.saveRecipe(aRecipe({content}))

            await expect(notAnObject).rejects.toThrow(/JSON object/)
        })

        test('advances the column exactly once on a matching update', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            const updatedRecipe = aRecipe({expectedRevision: revision, content: aRecipeContent({updated: true})})

            const result = await repository.saveRecipe(updatedRecipe)

            expect(result).toEqual({outcome: 'saved', revision: revision + 1})
            expect(await storedRow(recipe.id)).toEqual({revision: revision + 1, contents: updatedRecipe.content})
        })

        test('changes neither the contents nor the column on a stale update', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            await repository.saveRecipe(aRecipe({expectedRevision: revision, content: aRecipeContent({generation: 2})}))
            const staleRecipe = aRecipe({expectedRevision: revision, content: aRecipeContent({generation: 3})})
            const before = await repository.findRecipe(recipe.id)

            const result = await repository.saveRecipe(staleRecipe)

            expect(result).toEqual({outcome: 'conflict', currentRevision: revision + 1})
            expect(await repository.findRecipe(recipe.id)).toEqual(before)
        })

        test('lets exactly one of two writers from the same base revision win', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)

            const results = await Promise.all([
                repository.saveRecipe(aRecipe({expectedRevision: revision, content: aRecipeContent({writer: 'first'})})),
                repository.saveRecipe(aRecipe({expectedRevision: revision, content: aRecipeContent({writer: 'second'})}))
            ])

            expect(results.map(({outcome}) => outcome).sort()).toEqual(['conflict', 'saved'])
            expect((await repository.findRecipe(recipe.id)).recipe.revision).toBe(revision + 1)
        })

        test('reports a create against an existing id as a conflict, so a lost acknowledgement is recoverable', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)

            const result = await repository.saveRecipe(recipe)

            expect(result).toEqual({outcome: 'conflict', currentRevision: revision})
        })

        test('reports a foreign recipe as missing, and leaves it alone', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            const foreignRecipe = aRecipe({
                owner: ANOTHER_OWNER, expectedRevision: revision, content: aRecipeContent({foreign: true})
            })

            const result = await repository.saveRecipe(foreignRecipe)

            expect(result).toEqual({outcome: 'notFound'})
            expect((await storedRow(recipe.id)).contents).toEqual(recipe.content)
        })

        test('can never resurrect a removed recipe', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            await repository.removeRecipes([recipe.id], OWNER)

            const result = await repository.saveRecipe(
                aRecipe({expectedRevision: revision, content: aRecipeContent({resurrected: true})})
            )

            expect(result).toEqual({outcome: 'notFound'})
            expect(await repository.findRecipe(recipe.id)).toBeNull()
        })

        test('rejects a type change on an existing id distinctly', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)

            const result = await repository.saveRecipe(
                aRecipe({expectedRevision: revision, type: 'CLASSIFICATION'})
            )

            expect(result).toEqual({outcome: 'typeMismatch', currentRevision: revision})
            expect((await repository.findRecipe(recipe.id)).recipe.revision).toBe(revision)
        })

        // A retry at the unchanged revision must not write stale project placement back.
        test('leaves the project alone, so a retry after a move cannot undo it', async () => {
            const recipe = aRecipe({projectId: A_PROJECT_ID})
            const {revision} = await repository.saveRecipe(recipe)
            await repository.moveRecipes({
                projectId: DESTINATION_PROJECT_ID, recipeIds: [recipe.id], owner: OWNER
            })

            await repository.saveRecipe(aRecipe({
                projectId: A_PROJECT_ID, expectedRevision: revision, content: aRecipeContent({retried: true})
            }))

            expect((await repository.findRecipe(recipe.id)).recipe.projectId).toBe(DESTINATION_PROJECT_ID)
        })
    })

    describe('findRecipe', () => {
        test('carries ownership beside the recipe', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)

            const found = await repository.findRecipe(recipe.id)

            expect(found).toEqual({
                owner: recipe.owner,
                recipe: {...recipe.content, projectId: recipe.projectId, revision}
            })
        })

        test('reports a removed recipe as absent', async () => {
            const recipe = aRecipe()
            await repository.saveRecipe(recipe)
            await repository.removeRecipes([recipe.id], OWNER)

            expect(await repository.findRecipe(recipe.id)).toBeNull()
        })

        // Documents stored before placement and revision were stripped must lose to the columns.
        test('injects the columns, whatever a legacy document held', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            await storeLegacyDocument(recipe.id, {
                ...recipe.content, revision: 97, projectId: 'echoed-project'
            })

            const found = await repository.findRecipe(recipe.id)

            expect(found.recipe).toEqual({...recipe.content, projectId: recipe.projectId, revision})
        })

        test('injects the new project after a move, which advances no revision', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            await repository.moveRecipes({
                projectId: DESTINATION_PROJECT_ID, recipeIds: [recipe.id], owner: OWNER
            })

            const found = await repository.findRecipe(recipe.id)

            expect(found.recipe).toEqual({
                ...recipe.content, projectId: DESTINATION_PROJECT_ID, revision
            })
        })
    })

    describe('listRecipes', () => {
        // Listing must stay cheap: a summary that carried contents would load every stored document.
        test('describes each recipe without its content', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)

            const [summary] = await repository.listRecipes(OWNER)

            expect(summary).toEqual({
                id: recipe.id, projectId: recipe.projectId, name: recipe.name, type: recipe.type,
                revision, creationTime: expect.any(Date), updateTime: expect.any(Date)
            })
        })

        test('is scoped to its owner and excludes removed recipes', async () => {
            const owned = aRecipe({id: 'owned'})
            const removed = aRecipe({id: 'removed'})
            await repository.saveRecipe(owned)
            await repository.saveRecipe(aRecipe({id: 'another-owners', owner: ANOTHER_OWNER}))
            await repository.saveRecipe(removed)
            await repository.removeRecipes([removed.id], OWNER)

            const summaries = await repository.listRecipes(OWNER)

            expect(summaries.map(({id}) => id)).toEqual([owned.id])
        })
    })

    describe('removeRecipes', () => {
        test('is scoped to the owner', async () => {
            const owned = aRecipe({id: 'owned'})
            const anothers = aRecipe({id: 'another-owners', owner: ANOTHER_OWNER})
            await repository.saveRecipe(owned)
            await repository.saveRecipe(anothers)

            await repository.removeRecipes([owned.id, anothers.id], OWNER)

            expect(await repository.findRecipe(owned.id)).toBeNull()
            expect(await repository.findRecipe(anothers.id)).not.toBeNull()
        })
    })

    describe('findRecipesToMigrate', () => {
        test('finds recipes of the type below the given version, and only those', async () => {
            const staleRecipe = aRecipe({typeVersion: OUTDATED_TYPE_VERSION})
            const removed = aRecipe({id: 'removed', typeVersion: OUTDATED_TYPE_VERSION})
            await repository.saveRecipe(staleRecipe)
            await repository.saveRecipe(aRecipe({id: 'already-current', typeVersion: CURRENT_TYPE_VERSION}))
            await repository.saveRecipe(aRecipe({
                id: 'another-type', type: 'CLASSIFICATION', typeVersion: OUTDATED_TYPE_VERSION
            }))
            await repository.saveRecipe(removed)
            await repository.removeRecipes([removed.id], OWNER)

            const found = await repository.findRecipesToMigrate(staleRecipe.type, CURRENT_TYPE_VERSION)

            expect(found).toEqual([{
                id: staleRecipe.id, owner: staleRecipe.owner,
                typeVersion: staleRecipe.typeVersion, content: staleRecipe.content
            }])
        })

        // One corrupt document must not stop the batch, so it comes back unreadable instead of throwing.
        test('hands back an unreadable document rather than failing the read', async () => {
            const recipe = aRecipe({typeVersion: OUTDATED_TYPE_VERSION})
            await repository.saveRecipe(recipe)
            await storeUnreadableDocument(recipe.id)

            const found = await repository.findRecipesToMigrate(recipe.type, CURRENT_TYPE_VERSION)

            expect(found).toEqual([{
                id: recipe.id, owner: recipe.owner, typeVersion: recipe.typeVersion, content: null
            }])
        })
    })

    describe('saveMigratedRecipe', () => {
        test('rewrites the content and advances the column once', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            const migration = aRecipeMigration({content: aRecipeContent({migrated: true})})

            await repository.saveMigratedRecipe(migration)

            expect(await storedRow(recipe.id))
                .toEqual({revision: revision + 1, contents: migration.content})
        })

        test('strips server metadata a migration would otherwise write back', async () => {
            const content = aRecipeContent({migrated: true})
            const recipe = aRecipe()
            await repository.saveRecipe(recipe)

            await repository.saveMigratedRecipe(aRecipeMigration({
                content: {...content, revision: 97, projectId: 'echoed-project'}
            }))

            expect((await storedRow(recipe.id)).contents).toEqual(content)
        })

        test('fails instead of reporting success when it matches no row', async () => {
            const unmatched = repository.saveMigratedRecipe(aRecipeMigration())

            await expect(unmatched).rejects.toThrow(A_RECIPE_ID)
        })
    })

    describe('saveProject', () => {
        test('creates, then updates in place', async () => {
            const project = aProject()
            await repository.saveProject(project)
            const renamedProject = aProject({name: 'Renamed', defaultAssetFolder: 'assets'})

            await repository.saveProject(renamedProject)

            expect(await repository.listProjects(OWNER)).toEqual([{
                id: renamedProject.id, username: OWNER, name: renamedProject.name,
                defaultAssetFolder: renamedProject.defaultAssetFolder,
                defaultWorkspaceFolder: renamedProject.defaultWorkspaceFolder
            }])
        })

        // Two browsers creating the same project must converge, not surface a duplicate-key failure.
        test('lets concurrent creates of the same id all succeed, leaving one project', async () => {
            const project = aProject()

            const results = await Promise.allSettled(
                Array.from({length: 5}, () => repository.saveProject(project))
            )

            expect(results.map(({status}) => status)).toEqual(Array(5).fill('fulfilled'))
            expect((await repository.listProjects(OWNER)).map(({id}) => id)).toEqual([project.id])
        })

        // An upsert that updated unconditionally would let anyone overwrite a project by guessing its id.
        test('changes nothing and claims nothing when another user saves the same id', async () => {
            const project = aProject()
            await repository.saveProject(project)

            await repository.saveProject(aProject({
                owner: ANOTHER_OWNER, name: 'Hijacked',
                defaultAssetFolder: 'theirs', defaultWorkspaceFolder: 'theirs'
            }))

            expect(await repository.listProjects(OWNER)).toEqual([{
                id: project.id, username: OWNER, name: project.name,
                defaultAssetFolder: null, defaultWorkspaceFolder: null
            }])
            expect(await repository.listProjects(ANOTHER_OWNER)).toEqual([])
        })
    })

    describe('removeProject', () => {
        test('deletes the project and soft-deletes the recipes it held', async () => {
            const project = aProject()
            const held = aRecipe({projectId: project.id})
            await repository.saveProject(project)
            await repository.saveRecipe(held)

            await repository.removeProject(project.id, OWNER)

            expect(await repository.listProjects(OWNER)).toEqual([])
            expect(await repository.findRecipe(held.id)).toBeNull()
        })

        test('rolls back when the recipe soft-delete fails', async () => {
            const project = aProject()
            const held = aRecipe({projectId: project.id})
            await repository.saveProject(project)
            await repository.saveRecipe(held)
            const failing = new RecipeRepository(createTransactionRunner(poolFailingAfter(1)))

            const interrupted = failing.removeProject(project.id, OWNER)

            await expect(interrupted).rejects.toThrow(/connection lost/)
            expect((await repository.listProjects(OWNER)).map(({id}) => id)).toEqual([project.id])
            expect(await repository.findRecipe(held.id)).not.toBeNull()
        })

        test('leaves another user\'s project alone', async () => {
            const project = aProject()
            await repository.saveProject(project)

            await repository.removeProject(project.id, ANOTHER_OWNER)

            expect((await repository.listProjects(OWNER)).map(({id}) => id)).toEqual([project.id])
        })
    })

    describe('002.do.revision.sql', () => {
        beforeEach(() => createLegacySchema())

        afterEach(() => removeLegacySchema())

        test('backfills every existing row to column revision 1, rewriting no contents', async () => {
            const first = aLegacyRow({id: 'first'})
            const second = aLegacyRow({id: 'second'})
            await insertLegacyRow(first)
            await insertLegacyRow(second)

            await runRevisionMigration()

            const [rows] = await adminConnection.query(
                `SELECT id, revision, contents FROM \`${LEGACY}\`.recipe ORDER BY id`
            )
            expect(rows).toEqual([
                {id: first.id, revision: 1, contents: first.contents},
                {id: second.id, revision: 1, contents: second.contents}
            ])
        })
    })

    const aRecipe = (over = {}) => ({
        id: A_RECIPE_ID, owner: OWNER, name: 'A recipe', type: 'MOSAIC', projectId: A_PROJECT_ID,
        typeVersion: OUTDATED_TYPE_VERSION, content: aRecipeContent(),
        ...over
    })

    const aProject = (over = {}) => ({
        id: A_PROJECT_ID, owner: OWNER, name: 'A project',
        defaultAssetFolder: null, defaultWorkspaceFolder: null, ...over
    })

    const aRecipeMigration = (over = {}) => ({
        id: A_RECIPE_ID, owner: OWNER, typeVersion: CURRENT_TYPE_VERSION, content: aRecipeContent(), ...over
    })

    const aRecipeContent = (over = {}) => ({model: {source: 'LANDSAT'}, ...over})

    const aLegacyRow = (over = {}) => ({id: 'a-legacy-recipe', contents: '{"model":{"source":"LANDSAT"}}', ...over})

    // The public read mapping injects placement and revision, so only the column itself shows what was
    // actually written to the document.
    const storedRow = async id => {
        const [rows] = await scratchPool.query(
            `SELECT revision, contents FROM \`${SCRATCH}\`.recipe WHERE id = ?`, [id]
        )
        return {revision: rows[0].revision, contents: JSON.parse(rows[0].contents)}
    }

    const storeLegacyDocument = (id, document) => scratchPool.query(
        `UPDATE \`${SCRATCH}\`.recipe SET contents = ? WHERE id = ?`, [JSON.stringify(document), id]
    )

    const storeUnreadableDocument = id => scratchPool.query(
        `UPDATE \`${SCRATCH}\`.recipe SET contents = 'not json' WHERE id = ?`, [id]
    )

    // Real MySQL throughout - only the failure of one statement is synthetic, so a rollback here is
    // InnoDB's, not the test's.
    const poolFailingAfter = statements => {
        let remaining = statements
        return {
            getConnection: async () => {
                const connection = await scratchPool.getConnection()
                return {
                    query: (...args) => remaining-- > 0
                        ? connection.query(...args)
                        : Promise.reject(new Error('connection lost')),
                    beginTransaction: () => connection.beginTransaction(),
                    commit: () => connection.commit(),
                    rollback: () => connection.rollback(),
                    release: () => connection.release()
                }
            }
        }
    }

    // Dropped first: a scratch schema left behind by an interrupted run with the same pid would
    // otherwise be reused with whatever shape it had then.
    const createScratchSchema = async connection => {
        await connection.query(`DROP SCHEMA IF EXISTS \`${SCRATCH}\``)
        await connection.query(`CREATE SCHEMA \`${SCRATCH}\``)
        await createRecipeTable(connection, SCRATCH)
        await createProjectTable(connection, SCRATCH)
    }

    const createRecipeTable = (connection, schema) => connection.query(`
        CREATE TABLE \`${schema}\`.recipe (
            id varchar(36) NOT NULL, username varchar(32) NOT NULL, name varchar(255) NOT NULL,
            type varchar(63) NOT NULL, contents longtext NOT NULL,
            creation_time timestamp NOT NULL, update_time timestamp NOT NULL,
            removed boolean NOT NULL DEFAULT FALSE, type_version int DEFAULT 1, project_id varchar(255),
            revision int unsigned NOT NULL DEFAULT 1,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB
    `)

    const createProjectTable = (connection, schema) => connection.query(`
        CREATE TABLE \`${schema}\`.project (
            id varchar(36) NOT NULL, username varchar(32) NOT NULL, name varchar(255) NOT NULL,
            default_asset_folder text, default_workspace_folder text,
            PRIMARY KEY (id)
        ) ENGINE=InnoDB
    `)

    const clearScratchTables = async () => {
        await scratchPool.query(`DELETE FROM \`${SCRATCH}\`.recipe`)
        await scratchPool.query(`DELETE FROM \`${SCRATCH}\`.project`)
    }

    const removeScratchSchema = async () => {
        await scratchPool?.end()
        await adminConnection?.query(`DROP SCHEMA IF EXISTS \`${SCRATCH}\``)
        await adminConnection?.end()
    }

    // The migration predates the revision column, so its schema is the recipe table without one.
    const createLegacySchema = async () => {
        await adminConnection.query(`DROP SCHEMA IF EXISTS \`${LEGACY}\``)
        await adminConnection.query(`CREATE SCHEMA \`${LEGACY}\``)
        await adminConnection.query(`
            CREATE TABLE \`${LEGACY}\`.recipe (
                id varchar(36) NOT NULL, username varchar(32) NOT NULL, name varchar(255) NOT NULL,
                type varchar(63) NOT NULL, contents longtext NOT NULL,
                creation_time timestamp NOT NULL, update_time timestamp NOT NULL,
                removed boolean NOT NULL DEFAULT FALSE, type_version int DEFAULT 1,
                project_id varchar(255), PRIMARY KEY (id)
            ) ENGINE=InnoDB
        `)
    }

    const removeLegacySchema = () => adminConnection.query(`DROP SCHEMA IF EXISTS \`${LEGACY}\``)

    const insertLegacyRow = ({id, contents}) => adminConnection.query(
        `INSERT INTO \`${LEGACY}\`.recipe (id, username, name, type, contents, creation_time, update_time)
         VALUES (?, ?, 'n', 'MOSAIC', ?, NOW(), NOW())`,
        [id, OWNER, contents]
    )

    const runRevisionMigration = () => adminConnection.query(readFileSync(
        join(dirName(import.meta.url), '../migrations/002.do.revision.sql'), 'utf8'
    ).replaceAll('recipe.recipe', `\`${LEGACY}\`.recipe`))

    const A_RECIPE_ID = 'a-recipe'
    const A_PROJECT_ID = 'a-project'
    const DESTINATION_PROJECT_ID = 'destination-project'
    const OWNER = 'bob'
    const ANOTHER_OWNER = 'alice'
    const CURRENT_TYPE_VERSION = 8
    const OUTDATED_TYPE_VERSION = 3
})
