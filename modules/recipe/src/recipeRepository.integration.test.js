import {join} from 'path'

import {configureNoLogging} from '#sepal/log'
import {dirName} from '#sepal/path'
import {createTestDb} from '#sepal/testSupport/db/testDb'

import {RecipeRepository} from './recipeRepository.js'

// Mocked SQL cannot prove that the conditional update is atomic under concurrent MySQL writers.

describe('recipe repository', () => {
    let testDb
    let repository

    beforeAll(async () => {
        configureNoLogging()
        testDb = await createTestDb({name: 'reciperepository', migrations: MIGRATIONS_PATH})
        repository = new RecipeRepository(testDb.db)
    })

    beforeEach(() => testDb.reset())

    afterAll(() => testDb?.remove())

    describe('saveRecipe', () => {
        test('stores a lowercase owner and accepts an update using another spelling of its case', async () => {
            const recipe = aRecipe({owner: 'Alice'})
            const {revision} = await repository.saveRecipe(recipe)
            const created = await repository.findRecipe(recipe.id)
            const updated = {...recipe, owner: 'ALICE', expectedRevision: revision, content: aRecipeContent({updated: true})}

            const result = await repository.saveRecipe(updated)

            const found = await repository.findRecipe(recipe.id)
            expect(created.owner).toBe('alice')
            expect(result).toEqual({outcome: 'saved', revision: revision + 1})
            expect(found).toEqual({
                owner: 'alice', recipe: {...updated.content, projectId: recipe.projectId, revision: revision + 1}
            })
        })

        test.each([
            {expectedRevision: null, outcome: 'conflict'},
            {expectedRevision: 0, outcome: 'conflict'},
            {expectedRevision: 1, type: 'CLASSIFICATION', outcome: 'typeMismatch'}
        ])('reports $outcome instead of hiding a recipe from its mixed-case owner', async ({outcome, ...change}) => {
            const recipe = aRecipe({owner: 'Alice'})
            const {revision} = await repository.saveRecipe(recipe)

            const result = await repository.saveRecipe({...recipe, ...change, owner: 'ALICE'})

            expect(result).toEqual({outcome, currentRevision: revision})
            const found = await repository.findRecipe(recipe.id)
            expect(found.recipe).toEqual({...recipe.content, projectId: recipe.projectId, revision})
        })

        test('creates at column revision 1, storing the content it was given', async () => {
            const recipe = aRecipe()

            const result = await repository.saveRecipe(recipe)

            expect(result).toEqual({outcome: 'saved', revision: 1})
            const found = await repository.findRecipe(recipe.id)
            expect(found).toEqual({owner: recipe.owner, recipe: {...recipe.content, projectId: recipe.projectId, revision: 1}})
        })

        // A client may echo back the placement and revision a load injected; neither may reach the column.
        test('strips server metadata a client echoed back when creating', async () => {
            const content = aRecipeContent()
            const recipe = aRecipe({content: {...content, revision: 97, projectId: 'echoed-project'}})

            await repository.saveRecipe(recipe)

            const stored = await storedRow(recipe.id)
            expect(stored.contents).toEqual(content)
        })

        test('strips server metadata a client echoed back when updating', async () => {
            const content = aRecipeContent({updated: true})
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            const updatedRecipe = aRecipe({
                expectedRevision: revision, content: {...content, revision: 97, projectId: 'echoed-project'}
            })

            await repository.saveRecipe(updatedRecipe)

            const stored = await storedRow(recipe.id)
            expect(stored.contents).toEqual(content)
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
            const found = await repository.findRecipe(recipe.id)
            expect(found.recipe).toEqual({...updatedRecipe.content, projectId: recipe.projectId, revision: revision + 1})
        })

        test('changes neither the contents nor the column on a stale update', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            await repository.saveRecipe(aRecipe({expectedRevision: revision, content: aRecipeContent({generation: 2})}))
            const staleRecipe = aRecipe({expectedRevision: revision, content: aRecipeContent({generation: 3})})
            const before = await repository.findRecipe(recipe.id)

            const result = await repository.saveRecipe(staleRecipe)

            expect(result).toEqual({outcome: 'conflict', currentRevision: revision + 1})
            const found = await repository.findRecipe(recipe.id)
            expect(found).toEqual(before)
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
            const found = await repository.findRecipe(recipe.id)
            expect(found.recipe).toEqual({...recipe.content, projectId: recipe.projectId, revision})
        })

        test('can never resurrect a removed recipe', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            await repository.removeRecipes([recipe.id], OWNER)

            const result = await repository.saveRecipe(
                aRecipe({expectedRevision: revision, content: aRecipeContent({resurrected: true})})
            )

            expect(result).toEqual({outcome: 'notFound'})
            const found = await repository.findRecipe(recipe.id)
            expect(found).toBeNull()
        })

        test('rejects a type change on an existing id distinctly', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)

            const result = await repository.saveRecipe(
                aRecipe({expectedRevision: revision, type: 'CLASSIFICATION'})
            )

            expect(result).toEqual({outcome: 'typeMismatch', currentRevision: revision})
            const found = await repository.findRecipe(recipe.id)
            expect(found.recipe.revision).toBe(revision)
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

            const found = await repository.findRecipe(recipe.id)
            expect(found.recipe.projectId).toBe(DESTINATION_PROJECT_ID)
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

            const found = await repository.findRecipe(recipe.id)
            expect(found).toBeNull()
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

            const ownRecipe = await repository.findRecipe(owned.id)
            const anothersRecipe = await repository.findRecipe(anothers.id)
            expect(ownRecipe).toBeNull()
            expect(anothersRecipe).not.toBeNull()
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

    })

    describe('saveMigratedRecipe', () => {
        test('rewrites the content and advances the column once', async () => {
            const recipe = aRecipe()
            const {revision} = await repository.saveRecipe(recipe)
            const migration = aRecipeMigration({content: aRecipeContent({migrated: true})})

            await repository.saveMigratedRecipe(migration)

            const found = await repository.findRecipe(recipe.id)
            expect(found.recipe).toEqual({...migration.content, projectId: recipe.projectId, revision: revision + 1})
        })

        test('strips server metadata a migration would otherwise write back', async () => {
            const content = aRecipeContent({migrated: true})
            const recipe = aRecipe()
            await repository.saveRecipe(recipe)

            await repository.saveMigratedRecipe(aRecipeMigration({
                content: {...content, revision: 97, projectId: 'echoed-project'}
            }))

            const stored = await storedRow(recipe.id)
            expect(stored.contents).toEqual(content)
        })

        test('fails instead of reporting success when it matches no row', async () => {
            const unmatched = repository.saveMigratedRecipe(aRecipeMigration())

            await expect(unmatched).rejects.toThrow(A_RECIPE_ID)
        })
    })

    describe('saveProject', () => {
        test('stores a lowercase owner and updates the project using another spelling of its case', async () => {
            const project = aProject({owner: 'Alice'})
            await repository.saveProject(project)
            const renamed = {...project, owner: 'ALICE', name: 'Renamed'}

            await repository.saveProject(renamed)

            const projects = await repository.listProjects('Alice')
            expect(projects).toEqual([{
                id: project.id, username: 'alice', name: renamed.name, parentId: project.parentId,
                defaultAssetFolder: project.defaultAssetFolder,
                defaultWorkspaceFolder: project.defaultWorkspaceFolder
            }])
        })

        test('creates, then updates in place', async () => {
            const project = aProject()
            await repository.saveProject(project)
            const renamedProject = aProject({name: 'Renamed', defaultAssetFolder: 'assets'})

            await repository.saveProject(renamedProject)

            const projects = await repository.listProjects(OWNER)
            expect(projects).toEqual([{
                id: renamedProject.id, username: OWNER, name: renamedProject.name, parentId: renamedProject.parentId,
                defaultAssetFolder: renamedProject.defaultAssetFolder,
                defaultWorkspaceFolder: renamedProject.defaultWorkspaceFolder
            }])
        })

        // An upsert that updated unconditionally would let anyone overwrite a project by guessing its id.
        test('changes nothing and claims nothing when another user saves the same id', async () => {
            const project = aProject()
            await repository.saveProject(project)

            await repository.saveProject(aProject({
                owner: ANOTHER_OWNER, name: 'Hijacked',
                defaultAssetFolder: 'theirs', defaultWorkspaceFolder: 'theirs'
            }))

            const owners = await repository.listProjects(OWNER)
            const hijackers = await repository.listProjects(ANOTHER_OWNER)
            expect(owners).toEqual([{
                id: project.id, username: OWNER, name: project.name, parentId: null,
                defaultAssetFolder: null, defaultWorkspaceFolder: null
            }])
            expect(hijackers).toEqual([])
        })

        test('stores a parent, and defaults to no parent', async () => {
            const parent = aProject({id: 'parent-project', name: 'Parent'})
            const child = aProject({id: 'child-project', name: 'Child', parentId: parent.id})
            await repository.saveProject(parent)

            await repository.saveProject(child)

            const projects = await repository.listProjects(OWNER)
            expect(projects.find(({id}) => id === parent.id).parentId).toBeNull()
            expect(projects.find(({id}) => id === child.id).parentId).toBe(parent.id)
        })

        test('reparents an existing project', async () => {
            const parent = aProject({id: 'parent-project', name: 'Parent'})
            const child = aProject({id: 'child-project', name: 'Child'})
            await repository.saveProject(parent)
            await repository.saveProject(child)

            await repository.saveProject({...child, parentId: parent.id})

            const projects = await repository.listProjects(OWNER)
            expect(projects.find(({id}) => id === child.id).parentId).toBe(parent.id)
        })

        test('refuses to reparent a project another user owns', async () => {
            const foreign = aProject({owner: ANOTHER_OWNER})
            await repository.saveProject(foreign)

            await repository.saveProject({...foreign, owner: OWNER, parentId: 'somewhere-else'})

            const projects = await repository.listProjects(ANOTHER_OWNER)
            expect(projects).toEqual([{
                id: foreign.id, username: ANOTHER_OWNER, name: foreign.name, parentId: null,
                defaultAssetFolder: null, defaultWorkspaceFolder: null
            }])
        })

        // A parentId the attacker legitimately owns clears both parent guards, so this is what reaches
        // the upsert and exercises the row's own ownership guard rather than one of the parent's.
        test('refuses to reparent a project another user owns, even to a parent the attacker legitimately owns', async () => {
            const foreign = aProject({owner: ANOTHER_OWNER})
            await repository.saveProject(foreign)
            const ownParent = aProject({id: 'own-parent'})
            await repository.saveProject(ownParent)

            const result = await repository.saveProject({...foreign, owner: OWNER, parentId: ownParent.id})

            expect(result).toEqual({outcome: 'saved'})
            const projects = await repository.listProjects(ANOTHER_OWNER)
            expect(projects.find(({id}) => id === foreign.id).parentId).toBeNull()
        })

        test('refuses a project that is its own parent', async () => {
            const project = aProject()
            await repository.saveProject(project)

            const result = await repository.saveProject({...project, parentId: project.id})

            expect(result).toEqual({outcome: 'cycle'})
            const projects = await repository.listProjects(OWNER)
            expect(projects.find(({id}) => id === project.id).parentId).toBeNull()
        })

        test('refuses a parent that sits below the project being saved', async () => {
            const grandparent = aProject({id: 'grandparent', name: 'Grandparent'})
            const parent = aProject({id: 'parent', name: 'Parent', parentId: grandparent.id})
            const child = aProject({id: 'child', name: 'Child', parentId: parent.id})
            await repository.saveProject(grandparent)
            await repository.saveProject(parent)
            await repository.saveProject(child)

            const result = await repository.saveProject({...grandparent, parentId: child.id})

            expect(result).toEqual({outcome: 'cycle'})
        })

        test('refuses a parent that does not exist', async () => {
            const result = await repository.saveProject(aProject({parentId: 'no-such-project'}))

            expect(result).toEqual({outcome: 'parentNotFound'})
            expect(await repository.listProjects(OWNER)).toEqual([])
        })

        test('refuses a parent another user owns, reporting it absent', async () => {
            await repository.saveProject(aProject({id: 'foreign-parent', owner: ANOTHER_OWNER}))

            const result = await repository.saveProject(aProject({parentId: 'foreign-parent'}))

            expect(result).toEqual({outcome: 'parentNotFound'})
        })

        test('accepts a save with no parent', async () => {
            const result = await repository.saveProject(aProject())

            expect(result).toEqual({outcome: 'saved'})
        })
    })

    describe('removeProject', () => {
        test('removes a project holding nothing', async () => {
            const project = aProject()
            await repository.saveProject(project)

            const result = await repository.removeProject(project.id, OWNER)

            expect(result).toEqual({outcome: 'removed'})
            expect(await repository.listProjects(OWNER)).toEqual([])
        })

        test('refuses a project holding a recipe, keeping both', async () => {
            const project = aProject()
            const held = aRecipe({projectId: project.id})
            await repository.saveProject(project)
            await repository.saveRecipe(held)

            const result = await repository.removeProject(project.id, OWNER)

            expect(result).toEqual({outcome: 'notEmpty', folders: 0, recipes: 1})
            expect((await repository.listProjects(OWNER)).map(({id}) => id)).toEqual([project.id])
            expect(await repository.findRecipe(held.id)).not.toBeNull()
        })

        test('refuses a project holding another project', async () => {
            const parent = aProject({id: 'parent-project', name: 'Parent'})
            await repository.saveProject(parent)
            await repository.saveProject(aProject({id: 'child-project', name: 'Child', parentId: parent.id}))

            const result = await repository.removeProject(parent.id, OWNER)

            expect(result).toEqual({outcome: 'notEmpty', folders: 1, recipes: 0})
        })

        test('ignores a removed recipe when deciding whether a project is empty', async () => {
            const project = aProject()
            const held = aRecipe({projectId: project.id})
            await repository.saveProject(project)
            await repository.saveRecipe(held)
            await repository.removeRecipes([held.id], OWNER)

            const result = await repository.removeProject(project.id, OWNER)

            expect(result).toEqual({outcome: 'removed'})
        })

        test('leaves another user\'s project alone', async () => {
            const project = aProject()
            await repository.saveProject(project)

            await repository.removeProject(project.id, ANOTHER_OWNER)

            const projects = await repository.listProjects(OWNER)
            expect(projects.map(({id}) => id)).toEqual([project.id])
        })
    })

    describe('writers running at the same time', () => {
        let concurrent
        let concurrentRepository

        beforeAll(async () => {
            concurrent = await createTestDb({
                name: 'reciperepositoryconcurrent', migrations: MIGRATIONS_PATH, connections: COMPETING_WRITERS
            })
            concurrentRepository = new RecipeRepository(concurrent.db)
        })

        beforeEach(() => concurrent.reset())

        afterAll(() => concurrent?.remove())

        // Both saves are in flight together; MySQL decides how they interleave. The claim is only that
        // exactly one can win from a given base revision, whichever order it settles on.
        test('lets exactly one of two writers from the same base revision win', async () => {
            const recipe = aRecipe()
            const {revision} = await concurrentRepository.saveRecipe(recipe)

            const results = await Promise.all([
                concurrentRepository.saveRecipe(aRecipe({expectedRevision: revision, content: aRecipeContent({writer: 'first'})})),
                concurrentRepository.saveRecipe(aRecipe({expectedRevision: revision, content: aRecipeContent({writer: 'second'})}))
            ])

            expect(results.map(({outcome}) => outcome).sort()).toEqual(['conflict', 'saved'])
            const stored = await concurrentRepository.findRecipe(recipe.id)
            expect(stored.recipe.revision).toBe(revision + 1)
        })

        // Two browsers creating the same project must converge, not surface a duplicate-key failure.
        test('lets concurrent creates of the same id all succeed, leaving one project', async () => {
            const project = aProject()

            const results = await Promise.allSettled(
                Array.from({length: COMPETING_WRITERS}, () => concurrentRepository.saveProject(project))
            )

            expect(results.map(({status}) => status)).toEqual(Array(COMPETING_WRITERS).fill('fulfilled'))
            const projects = await concurrentRepository.listProjects(OWNER)
            expect(projects.map(({id}) => id)).toEqual([project.id])
        })
    })

    const aRecipe = (over = {}) => ({
        id: A_RECIPE_ID, owner: OWNER, name: 'A recipe', type: 'MOSAIC', projectId: A_PROJECT_ID,
        typeVersion: OUTDATED_TYPE_VERSION, content: aRecipeContent(),
        ...over
    })

    const aProject = (over = {}) => ({
        id: A_PROJECT_ID, owner: OWNER, name: 'A project', parentId: null,
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
    const A_PROJECT_ID = 'a-project'
    const DESTINATION_PROJECT_ID = 'destination-project'
    const OWNER = 'bob'
    const ANOTHER_OWNER = 'alice'
    const CURRENT_TYPE_VERSION = 8
    const OUTDATED_TYPE_VERSION = 3

    // Enough connections for every writer the concurrency scenarios start at once; queueing stays off, so
    // one more acquisition than this would fail rather than wait.
    const COMPETING_WRITERS = 5

    const MIGRATIONS_PATH = join(dirName(import.meta.url), '../migrations')
})
