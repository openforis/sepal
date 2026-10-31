import assert from 'node:assert/strict'
import {join} from 'node:path'
import {after, before, beforeEach, describe, test} from 'node:test'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {RecipeRepository} from './recipeRepository.js'

// Mocked SQL cannot prove that the conditional update is atomic under concurrent MySQL writers.

describe('recipe repository', () => {
    let testDb
    let repository

    before(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'reciperepository', migrations: MIGRATIONS_PATH})
        repository = new RecipeRepository(testDb.db)
    })

    beforeEach(() => testDb.reset())

    after(() => testDb?.remove())

    describe('saveRecipe', () => {
        test('stores a lowercase owner and accepts an update using another spelling of its case', async () => {
            const recipe = aRecipe({owner: 'Alice'})
            const {revision} = await repository.saveRecipe(recipe)
            const created = await repository.findRecipe(recipe.id)
            const updated = {...recipe, owner: 'ALICE', expectedRevision: revision, content: aRecipeContent({updated: true})}

            const result = await repository.saveRecipe(updated)

            const found = await repository.findRecipe(recipe.id)
            assert.equal(created.owner, 'alice')
            assert.deepEqual(result, {outcome: 'saved', revision: revision + 1})
            assert.deepEqual(found, {
                owner: 'alice', recipe: {...updated.content, folderId: recipe.folderId, revision: revision + 1}
            })
        })

        for (const {outcome, ...change} of [
            {expectedRevision: null, outcome: 'conflict'},
            {expectedRevision: 0, outcome: 'conflict'},
            {expectedRevision: 1, type: 'CLASSIFICATION', outcome: 'typeMismatch'}
        ]) {
            test(
                `reports ${outcome} instead of hiding a recipe from its mixed-case owner`,
                async () => {
                    const recipe = aRecipe({owner: 'Alice'})
                    const {revision} = await repository.saveRecipe(recipe)

                    const result = await repository.saveRecipe({...recipe, ...change, owner: 'ALICE'})

                    assert.deepEqual(result, {outcome, currentRevision: revision})
                    const found = await repository.findRecipe(recipe.id)
                    assert.deepEqual(found.recipe, {...recipe.content, folderId: recipe.folderId, revision})
                }
            )
        }

        test('creates at column revision 1, storing the content it was given', async () => {
            const recipe = aRecipe()

            const result = await repository.saveRecipe(recipe)

            assert.deepEqual(result, {outcome: 'saved', revision: 1})
            const found = await repository.findRecipe(recipe.id)
            assert.deepEqual(
                found,
                {owner: recipe.owner, recipe: {...recipe.content, folderId: recipe.folderId, revision: 1}}
            )
        })

        // A client may echo back the placement and revision a load injected; neither may reach the column.
        test('strips server metadata a client echoed back when creating', async () => {
            const content = aRecipeContent()
            const recipe = aRecipe({content: {...content, revision: 97, folderId: 'echoed-folder'}})

            await repository.saveRecipe(recipe)

            const stored = await storedRow(recipe.id)
            assert.deepEqual(stored.contents, content)
        })

        test('strips server metadata a client echoed back when updating', async () => {
            const content = aRecipeContent({updated: true})
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            const updatedRecipe = aRecipe({
                expectedRevision: revision, content: {...content, revision: 97, folderId: 'echoed-folder'}
            })

            await repository.saveRecipe(updatedRecipe)

            const stored = await storedRow(recipe.id)
            assert.deepEqual(stored.contents, content)
        })

        for (const [content] of [['a string'], [[1, 2]]]) {
            test(`refuses ${content}, which is not a recipe object`, async () => {
                const notAnObject = repository.saveRecipe(aRecipe({content}))

                await assert.rejects(notAnObject, /JSON object/)
            })
        }

        test('advances the column exactly once on a matching update', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            const updatedRecipe = aRecipe({expectedRevision: revision, content: aRecipeContent({updated: true})})

            const result = await repository.saveRecipe(updatedRecipe)

            assert.deepEqual(result, {outcome: 'saved', revision: revision + 1})
            const found = await repository.findRecipe(recipe.id)
            assert.deepEqual(
                found.recipe,
                {...updatedRecipe.content, folderId: recipe.folderId, revision: revision + 1}
            )
        })

        test('changes neither the contents nor the column on a stale update', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            await repository.saveRecipe(aRecipe({expectedRevision: revision, content: aRecipeContent({generation: 2})}))
            const staleRecipe = aRecipe({expectedRevision: revision, content: aRecipeContent({generation: 3})})
            const before = await repository.findRecipe(recipe.id)

            const result = await repository.saveRecipe(staleRecipe)

            assert.deepEqual(result, {outcome: 'conflict', currentRevision: revision + 1})
            const found = await repository.findRecipe(recipe.id)
            assert.deepEqual(found, before)
        })

        test('reports a create against an existing id as a conflict, so a lost acknowledgement is recoverable', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)

            const result = await repository.saveRecipe(recipe)

            assert.deepEqual(result, {outcome: 'conflict', currentRevision: revision})
        })

        test('reports a foreign recipe as missing, and leaves it alone', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            const foreignRecipe = aRecipe({
                owner: ANOTHER_OWNER, expectedRevision: revision, content: aRecipeContent({foreign: true})
            })

            const result = await repository.saveRecipe(foreignRecipe)

            assert.deepEqual(result, {outcome: 'notFound'})
            const found = await repository.findRecipe(recipe.id)
            assert.deepEqual(found.recipe, {...recipe.content, folderId: recipe.folderId, revision})
        })

        test('can never resurrect a removed recipe', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            await repository.removeRecipes([recipe.id], OWNER)

            const result = await repository.saveRecipe(
                aRecipe({expectedRevision: revision, content: aRecipeContent({resurrected: true})})
            )

            assert.deepEqual(result, {outcome: 'notFound'})
            const found = await repository.findRecipe(recipe.id)
            assert.equal(found, null)
        })

        test('rejects a type change on an existing id distinctly', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)

            const result = await repository.saveRecipe(
                aRecipe({expectedRevision: revision, type: 'CLASSIFICATION'})
            )

            assert.deepEqual(result, {outcome: 'typeMismatch', currentRevision: revision})
            const found = await repository.findRecipe(recipe.id)
            assert.equal(found.recipe.revision, revision)
        })

        // A retry at the unchanged revision must not write stale folder placement back.
        test('leaves the folder alone, so a retry after a move cannot undo it', async () => {
            const original = aFolder()
            const destination = aFolder({id: DESTINATION_FOLDER_ID})
            await repository.saveFolder(original)
            await repository.saveFolder(destination)
            const recipe = aRecipe({folderId: original.id})
            const {revision} = await repository.saveRecipe(recipe)
            await repository.moveRecipes({
                folderId: destination.id, recipeIds: [recipe.id], owner: OWNER
            })

            await repository.saveRecipe({
                ...recipe, expectedRevision: revision, content: aRecipeContent({retried: true})
            })

            const found = await repository.findRecipe(recipe.id)
            assert.equal(found.recipe.folderId, destination.id)
        })

        test('places a new recipe in a folder its owner has', async () => {
            const folder = aFolder()
            await repository.saveFolder(folder)
            const recipe = aRecipe({folderId: folder.id})

            await repository.saveRecipe(recipe)

            const found = await repository.findRecipe(recipe.id)
            assert.equal(found.recipe.folderId, folder.id)
        })

        // The tree shows a recipe only in a folder that exists or at the root; anywhere else it would vanish.
        test('places a new recipe at the root when its folder does not exist, and still saves it', async () => {
            const recipe = aRecipe({folderId: 'removed-folder'})

            const result = await repository.saveRecipe(recipe)

            assert.deepEqual(result, {outcome: 'saved', revision: 1})
            const found = await repository.findRecipe(recipe.id)
            assert.equal(found.recipe.folderId, null)
        })

        test('places a new recipe at the root when its folder is another user\'s', async () => {
            const foreign = aFolder({owner: ANOTHER_OWNER})
            await repository.saveFolder(foreign)
            const recipe = aRecipe({folderId: foreign.id})

            await repository.saveRecipe(recipe)

            const found = await repository.findRecipe(recipe.id)
            assert.equal(found.recipe.folderId, null)
        })
    })

    describe('findRecipe', () => {
        test('carries ownership beside the recipe', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)

            const found = await repository.findRecipe(recipe.id)

            assert.deepEqual(found, {
                owner: recipe.owner,
                recipe: {...recipe.content, folderId: recipe.folderId, revision}
            })
        })

        test('reports a removed recipe as absent', async () => {
            const recipe = aRecipe()
            await repository.saveRecipe(recipe)
            await repository.removeRecipes([recipe.id], OWNER)

            const found = await repository.findRecipe(recipe.id)
            assert.equal(found, null)
        })

        // Documents stored before placement and revision were stripped must lose to the columns.
        test('injects the columns, whatever a legacy document held', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            await storeLegacyDocument(recipe.id, {
                ...recipe.content, revision: 97, folderId: 'echoed-folder', projectId: 'a-folder-by-its-old-name'
            })

            const found = await repository.findRecipe(recipe.id)

            assert.deepEqual(found.recipe, {...recipe.content, folderId: recipe.folderId, revision})
        })

        test('injects the new folder after a move, which advances no revision', async () => {
            const destination = aFolder({id: DESTINATION_FOLDER_ID})
            await repository.saveFolder(destination)
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            await repository.moveRecipes({
                folderId: destination.id, recipeIds: [recipe.id], owner: OWNER
            })

            const found = await repository.findRecipe(recipe.id)

            assert.deepEqual(found.recipe, {
                ...recipe.content, folderId: destination.id, revision
            })
        })
    })

    describe('listRecipes', () => {
        // Listing must stay cheap: a summary that carried contents would load every stored document.
        test('describes each recipe without its content', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)

            const [summary] = await repository.listRecipes(OWNER)

            const {creationTime, updateTime, ...rest} = summary
            assert.deepEqual(rest, {id: recipe.id, folderId: recipe.folderId, name: recipe.name, type: recipe.type, revision})
            assert.ok(creationTime instanceof Date)
            assert.ok(updateTime instanceof Date)
        })

        test('is scoped to its owner and excludes removed recipes', async () => {
            const owned = aRecipe({id: 'owned'})
            const removed = aRecipe({id: 'removed'})
            await repository.saveRecipe(owned)
            await repository.saveRecipe(aRecipe({id: 'another-owners', owner: ANOTHER_OWNER}))
            await repository.saveRecipe(removed)
            await repository.removeRecipes([removed.id], OWNER)

            const summaries = await repository.listRecipes(OWNER)

            assert.deepEqual(summaries.map(({id}) => id), [owned.id])
        })
    })

    describe('removeRecipes', () => {
        test('is scoped to the owner', async () => {
            const owned = aRecipe({id: 'owned'})
            const anothers = aRecipe({id: 'another-owners', owner: ANOTHER_OWNER})
            await repository.saveRecipe(owned)
            await repository.saveRecipe(anothers)

            await repository.removeRecipes([owned.id, anothers.id], OWNER)

            const ownRecipe = await repository.findRecipe(owned.id)
            const anothersRecipe = await repository.findRecipe(anothers.id)
            assert.equal(ownRecipe, null)
            assert.notEqual(anothersRecipe, null)
        })
    })

    describe('moveRecipes', () => {
        test('moves the recipes into a folder their owner has', async () => {
            const destination = aFolder({id: DESTINATION_FOLDER_ID})
            await repository.saveFolder(destination)
            const recipe = aRecipe()
            await repository.saveRecipe(recipe)

            const result = await repository.moveRecipes({
                folderId: destination.id, recipeIds: [recipe.id], owner: OWNER
            })

            assert.deepEqual(result, {outcome: 'moved'})
            const found = await repository.findRecipe(recipe.id)
            assert.equal(found.recipe.folderId, destination.id)
        })

        test('moves the recipes to the root', async () => {
            const folder = aFolder()
            await repository.saveFolder(folder)
            const recipe = aRecipe({folderId: folder.id})
            await repository.saveRecipe(recipe)

            const result = await repository.moveRecipes({folderId: null, recipeIds: [recipe.id], owner: OWNER})

            assert.deepEqual(result, {outcome: 'moved'})
            const found = await repository.findRecipe(recipe.id)
            assert.equal(found.recipe.folderId, null)
        })

        test('refuses a destination that does not exist, moving nothing', async () => {
            const recipe = aRecipe()
            await repository.saveRecipe(recipe)

            const result = await repository.moveRecipes({
                folderId: 'removed-folder', recipeIds: [recipe.id], owner: OWNER
            })

            assert.deepEqual(result, {outcome: 'folderNotFound'})
            const found = await repository.findRecipe(recipe.id)
            assert.equal(found.recipe.folderId, recipe.folderId)
        })

        test('refuses a destination another user owns, moving nothing', async () => {
            const foreign = aFolder({owner: ANOTHER_OWNER})
            await repository.saveFolder(foreign)
            const recipe = aRecipe()
            await repository.saveRecipe(recipe)

            const result = await repository.moveRecipes({
                folderId: foreign.id, recipeIds: [recipe.id], owner: OWNER
            })

            assert.deepEqual(result, {outcome: 'folderNotFound'})
            const found = await repository.findRecipe(recipe.id)
            assert.equal(found.recipe.folderId, recipe.folderId)
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

            assert.deepEqual(found, [{
                id: staleRecipe.id, owner: staleRecipe.owner,
                typeVersion: staleRecipe.typeVersion, content: staleRecipe.content
            }])
        })

    })

    describe('saveMigratedRecipe', () => {
        test('rewrites the content and advances the column once', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            const migration = aRecipeMigration({content: aRecipeContent({migrated: true})})

            await repository.saveMigratedRecipe(migration)

            const found = await repository.findRecipe(recipe.id)
            assert.deepEqual(
                found.recipe,
                {...migration.content, folderId: recipe.folderId, revision: revision + 1}
            )
        })

        test('strips server metadata a migration would otherwise write back', async () => {
            const content = aRecipeContent({migrated: true})
            const recipe = aRecipe()
            await repository.saveRecipe(recipe)

            await repository.saveMigratedRecipe(aRecipeMigration({
                content: {...content, revision: 97, folderId: 'echoed-folder'}
            }))

            const stored = await storedRow(recipe.id)
            assert.deepEqual(stored.contents, content)
        })

        test('fails instead of reporting success when it matches no row', async () => {
            const unmatched = repository.saveMigratedRecipe(aRecipeMigration())

            await assert.rejects(unmatched, error => error.message.includes(A_RECIPE_ID))
        })
    })

    describe('saveFolder', () => {
        test('stores a lowercase owner and updates the folder using another spelling of its case', async () => {
            const folder = aFolder({owner: 'Alice'})
            await repository.saveFolder(folder)
            const renamed = {...folder, owner: 'ALICE', name: 'Renamed'}

            await repository.saveFolder(renamed)

            const folders = await repository.listFolders('Alice')
            assert.deepEqual(folders, [{
                id: folder.id, username: 'alice', name: renamed.name, parentId: folder.parentId,
                defaultAssetFolder: folder.defaultAssetFolder,
                defaultWorkspaceFolder: folder.defaultWorkspaceFolder
            }])
        })

        test('creates, then updates in place', async () => {
            const folder = aFolder()
            await repository.saveFolder(folder)
            const renamedFolder = aFolder({name: 'Renamed', defaultAssetFolder: 'assets'})

            await repository.saveFolder(renamedFolder)

            const folders = await repository.listFolders(OWNER)
            assert.deepEqual(folders, [{
                id: renamedFolder.id, username: OWNER, name: renamedFolder.name, parentId: renamedFolder.parentId,
                defaultAssetFolder: renamedFolder.defaultAssetFolder,
                defaultWorkspaceFolder: renamedFolder.defaultWorkspaceFolder
            }])
        })

        // An upsert that updated unconditionally would let anyone overwrite a folder by guessing its id.
        test('changes nothing and claims nothing when another user saves the same id', async () => {
            const folder = aFolder()
            await repository.saveFolder(folder)

            await repository.saveFolder(aFolder({
                owner: ANOTHER_OWNER, name: 'Hijacked',
                defaultAssetFolder: 'theirs', defaultWorkspaceFolder: 'theirs'
            }))

            const owners = await repository.listFolders(OWNER)
            const hijackers = await repository.listFolders(ANOTHER_OWNER)
            assert.deepEqual(owners, [{
                id: folder.id, username: OWNER, name: folder.name, parentId: null,
                defaultAssetFolder: null, defaultWorkspaceFolder: null
            }])
            assert.deepEqual(hijackers, [])
        })

        test('stores a parent, and defaults to no parent', async () => {
            const parent = aFolder({id: 'parent-folder', name: 'Parent'})
            const child = aFolder({id: 'child-folder', name: 'Child', parentId: parent.id})
            await repository.saveFolder(parent)

            await repository.saveFolder(child)

            const folders = await repository.listFolders(OWNER)
            assert.equal(folders.find(({id}) => id === parent.id).parentId, null)
            assert.equal(folders.find(({id}) => id === child.id).parentId, parent.id)
        })

        test('reparents an existing folder', async () => {
            const parent = aFolder({id: 'parent-folder', name: 'Parent'})
            const child = aFolder({id: 'child-folder', name: 'Child'})
            await repository.saveFolder(parent)
            await repository.saveFolder(child)

            await repository.saveFolder({...child, parentId: parent.id})

            const folders = await repository.listFolders(OWNER)
            assert.equal(folders.find(({id}) => id === child.id).parentId, parent.id)
        })

        test('refuses to reparent a folder another user owns', async () => {
            const foreign = aFolder({owner: ANOTHER_OWNER})
            await repository.saveFolder(foreign)

            await repository.saveFolder({...foreign, owner: OWNER, parentId: 'somewhere-else'})

            const folders = await repository.listFolders(ANOTHER_OWNER)
            assert.deepEqual(folders, [{
                id: foreign.id, username: ANOTHER_OWNER, name: foreign.name, parentId: null,
                defaultAssetFolder: null, defaultWorkspaceFolder: null
            }])
        })

        // A parentId the attacker legitimately owns clears both parent guards, so this is what reaches
        // the upsert and exercises the row's own ownership guard rather than one of the parent's.
        test('refuses to reparent a folder another user owns, even to a parent the attacker legitimately owns', async () => {
            const foreign = aFolder({owner: ANOTHER_OWNER})
            await repository.saveFolder(foreign)
            const ownParent = aFolder({id: 'own-parent'})
            await repository.saveFolder(ownParent)

            const result = await repository.saveFolder({...foreign, owner: OWNER, parentId: ownParent.id})

            assert.deepEqual(result, {outcome: 'saved'})
            const folders = await repository.listFolders(ANOTHER_OWNER)
            assert.equal(folders.find(({id}) => id === foreign.id).parentId, null)
        })

        test('refuses a folder that is its own parent', async () => {
            const folder = aFolder()
            await repository.saveFolder(folder)

            const result = await repository.saveFolder({...folder, parentId: folder.id})

            assert.deepEqual(result, {outcome: 'cycle'})
            const folders = await repository.listFolders(OWNER)
            assert.equal(folders.find(({id}) => id === folder.id).parentId, null)
        })

        test('refuses a parent that sits below the folder being saved', async () => {
            const grandparent = aFolder({id: 'grandparent', name: 'Grandparent'})
            const parent = aFolder({id: 'parent', name: 'Parent', parentId: grandparent.id})
            const child = aFolder({id: 'child', name: 'Child', parentId: parent.id})
            await repository.saveFolder(grandparent)
            await repository.saveFolder(parent)
            await repository.saveFolder(child)

            const result = await repository.saveFolder({...grandparent, parentId: child.id})

            assert.deepEqual(result, {outcome: 'cycle'})
        })

        test('refuses a parent that does not exist', async () => {
            const result = await repository.saveFolder(aFolder({parentId: 'no-such-folder'}))

            assert.deepEqual(result, {outcome: 'parentNotFound'})
            assert.deepEqual(await repository.listFolders(OWNER), [])
        })

        test('refuses a parent another user owns, reporting it absent', async () => {
            await repository.saveFolder(aFolder({id: 'foreign-parent', owner: ANOTHER_OWNER}))

            const result = await repository.saveFolder(aFolder({parentId: 'foreign-parent'}))

            assert.deepEqual(result, {outcome: 'parentNotFound'})
        })

        test('accepts a save with no parent', async () => {
            const result = await repository.saveFolder(aFolder())

            assert.deepEqual(result, {outcome: 'saved'})
        })

        // POST /folder lets through 255 characters, so the column must hold that many of the widest kind.
        test('stores a name of 255 four-byte characters', async () => {
            const folder = aFolder({name: '🌍'.repeat(255)})

            await repository.saveFolder(folder)

            const [stored] = await repository.listFolders(OWNER)
            assert.equal(stored.name, folder.name)
        })
    })

    describe('removeFolder', () => {
        test('removes a folder holding nothing', async () => {
            const folder = aFolder()
            await repository.saveFolder(folder)

            const result = await repository.removeFolder(folder.id, OWNER)

            assert.deepEqual(result, {outcome: 'removed'})
            assert.deepEqual(await repository.listFolders(OWNER), [])
        })

        test('refuses a folder holding a recipe, keeping both', async () => {
            const folder = aFolder()
            const held = aRecipe({folderId: folder.id})
            await repository.saveFolder(folder)
            await repository.saveRecipe(held)

            const result = await repository.removeFolder(folder.id, OWNER)

            assert.deepEqual(result, {outcome: 'notEmpty', folders: 0, recipes: 1})
            assert.deepEqual((await repository.listFolders(OWNER)).map(({id}) => id), [folder.id])
            assert.notEqual(await repository.findRecipe(held.id), null)
        })

        test('refuses a folder holding another folder', async () => {
            const parent = aFolder({id: 'parent-folder', name: 'Parent'})
            await repository.saveFolder(parent)
            await repository.saveFolder(aFolder({id: 'child-folder', name: 'Child', parentId: parent.id}))

            const result = await repository.removeFolder(parent.id, OWNER)

            assert.deepEqual(result, {outcome: 'notEmpty', folders: 1, recipes: 0})
        })

        test('ignores a removed recipe when deciding whether a folder is empty', async () => {
            const folder = aFolder()
            const held = aRecipe({folderId: folder.id})
            await repository.saveFolder(folder)
            await repository.saveRecipe(held)
            await repository.removeRecipes([held.id], OWNER)

            const result = await repository.removeFolder(folder.id, OWNER)

            assert.deepEqual(result, {outcome: 'removed'})
        })

        test('leaves another user\'s folder alone', async () => {
            const folder = aFolder()
            await repository.saveFolder(folder)

            await repository.removeFolder(folder.id, ANOTHER_OWNER)

            const folders = await repository.listFolders(OWNER)
            assert.deepEqual(folders.map(({id}) => id), [folder.id])
        })
    })

    describe('writers running at the same time', () => {
        let concurrent
        let concurrentRepository

        before(async () => {
            concurrent = await createTestDb({
                name: 'reciperepositoryconcurrent', migrations: MIGRATIONS_PATH, connections: COMPETING_WRITERS
            })
            concurrentRepository = new RecipeRepository(concurrent.db)
        })

        beforeEach(() => concurrent.reset())

        after(() => concurrent?.remove())

        // Both saves are in flight together; MySQL decides how they interleave. The claim is only that
        // exactly one can win from a given base revision, whichever order it settles on.
        test('lets exactly one of two writers from the same base revision win', async () => {
            const recipe = aRecipe()
            const {revision} = await concurrentRepository.saveRecipe(recipe)

            const results = await Promise.all([
                concurrentRepository.saveRecipe(aRecipe({expectedRevision: revision, content: aRecipeContent({writer: 'first'})})),
                concurrentRepository.saveRecipe(aRecipe({expectedRevision: revision, content: aRecipeContent({writer: 'second'})}))
            ])

            assert.deepEqual(results.map(({outcome}) => outcome).sort(), ['conflict', 'saved'])
            const stored = await concurrentRepository.findRecipe(recipe.id)
            assert.equal(stored.recipe.revision, revision + 1)
        })

        // Two browsers creating the same folder must converge, not surface a duplicate-key failure.
        test('lets concurrent creates of the same id all succeed, leaving one folder', async () => {
            const folder = aFolder()

            const results = await Promise.allSettled(
                Array.from({length: COMPETING_WRITERS}, () => concurrentRepository.saveFolder(folder))
            )

            assert.deepEqual(
                results.map(({status}) => status),
                Array(COMPETING_WRITERS).fill('fulfilled')
            )
            const folders = await concurrentRepository.listFolders(OWNER)
            assert.deepEqual(folders.map(({id}) => id), [folder.id])
        })
    })

    const aRecipe = (over = {}) => ({
        id: A_RECIPE_ID, owner: OWNER, name: 'A recipe', type: 'MOSAIC', folderId: null,
        typeVersion: OUTDATED_TYPE_VERSION, content: aRecipeContent(),
        ...over
    })

    const aFolder = (over = {}) => ({
        id: A_FOLDER_ID, owner: OWNER, name: 'A folder', parentId: null,
        defaultAssetFolder: null, defaultWorkspaceFolder: null, ...over
    })

    const aRecipeMigration = (over = {}) => ({
        id: A_RECIPE_ID, owner: OWNER, typeVersion: CURRENT_TYPE_VERSION, content: aRecipeContent(), ...over
    })

    const aRecipeContent = (over = {}) => ({model: {source: 'LANDSAT'}, ...over})

    // Only for the stored-document invariant: a public read injects placement and revision, so it cannot
    // show whether a submitted one reached the column.
    const storedRow = async id => {
        const [rows] = await testDb.query('SELECT revision, contents FROM recipe WHERE id = ?', [id])
        return {revision: rows[0].revision, contents: JSON.parse(rows[0].contents)}
    }

    const storeLegacyDocument = (id, document) => testDb.query(
        'UPDATE recipe SET contents = ? WHERE id = ?', [JSON.stringify(document), id]
    )

    const A_RECIPE_ID = 'a-recipe'
    const A_FOLDER_ID = 'a-folder'
    const DESTINATION_FOLDER_ID = 'destination-folder'
    const OWNER = 'bob'
    const ANOTHER_OWNER = 'alice'
    const CURRENT_TYPE_VERSION = 8
    const OUTDATED_TYPE_VERSION = 3

    // Enough connections for every writer the concurrency scenarios start at once; queueing stays off, so
    // one more acquisition than this would fail rather than wait.
    const COMPETING_WRITERS = 5

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
