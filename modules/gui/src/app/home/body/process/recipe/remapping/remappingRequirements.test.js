import {beforeEach, describe, expect, it, vi} from 'vitest'

// What Remapping's mapping needs of its own configuration as applied - each constraint reads an input still there, and a
// band that input includes - as its shared definition finds it, and what holds its image output back by it: its
// previews and Retrieve, offered and submitted, and those of a Remapping of it, through the real registration, shared
// declaration, common read and generic submission. Only the task API is replaced.

vi.mock('~/translate', () => ({msg: (key, values) => values ? `${key} ${JSON.stringify(values)}` : key}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/app/home/body/process/recipe/recipeOutputPath', () => ({getTaskInfo: () => ({})}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))

const submitted = vi.hoisted(() => [])
vi.mock('~/apiRegistry', () => ({
    default: {
        tasks: {
            submit$: task => {
                submitted.push(task)
                return {subscribe: () => {}}
            }
        }
    }
}))

const {readImageOutput} = await import('#sepal/recipe/output/readImageOutput')
const {recipeType} = await import('#sepal/recipe/recipeTypeRegistry')
const {addRecipeType} = await import('~/app/home/body/process/recipeTypeRegistry')
const {default: remapping} = await import('./remapping')
const {retrieveTask} = await import('./remappingRecipe')
const {buildMapDependencyGraph} = await import('../mapDependencyGraph')
const {IMAGE_OUTPUT} = await import('../recipeOutput')
const {physicalRequest, readRetrieveOutput, submitRetrieve} = await import('../retrieveOutput')
const {retrieveAvailability} = await import('../operationAvailability')
const {itemStatusesOfState, sourceProblemsOfState} = await import('../selectedSourceStatus')
const {requestGate} = await import('../sourceRequirements')

addRecipeType(remapping())

beforeEach(() => {
    submitted.length = 0
})

describe('a legend entry\'s constraints', () => {
    it('are said of their entry, each problem once, by what the constraints read', () => {
        const recipe = remappingOf([
            entry('valid', [constraint('i-1', 'class')]),
            entry('removed', [constraint('i-gone', 'class'), constraint('i-gone', 'ndvi')]),
            entry('notIncluded', [constraint('i-1', 'ndvi'), constraint('i-1', 'class')])
        ])
        const state = stateOf(recipe)

        expect(entryProblems(state, recipe)).toEqual({
            removed: {message: MISSING_INPUT, details: []},
            notIncluded: {message: `${BAND_NOT_INCLUDED} {"band":"ndvi"}`, details: []}
        })
    })

    it('say every problem of their entry, in the order of the constraints', () => {
        const recipe = remappingOf([entry('l-1', [constraint('i-1', 'ndvi'), constraint('i-gone', 'class')])])

        expect(entryProblems(stateOf(recipe), recipe)).toEqual({
            'l-1': {message: `${BAND_NOT_INCLUDED} {"band":"ndvi"}`, details: [MISSING_INPUT]}
        })
    })

    it.each([
        ['an input since removed', 'i-gone', 'class'],
        ['a band its input does not include', 'i-1', 'ndvi']
    ])('hold back the image output while one reads %s, by Mapping', (_case, image, band) => {
        const recipe = remappingOf([entry('l-1', [constraint(image, band)])])

        expect(requestGate({state: stateOf(recipe), recipe, operation: IMAGE_OUTPUT, heldFor: describedFor(recipe)}))
            .toMatchObject({code: 'CONFIGURATION_UNMET', section: MAPPING, withdraw: true})
    })

    it('hold back nothing once each reads a band its input includes', () => {
        const recipe = remappingOf([entry('l-1', [constraint('i-1', 'class')])])

        expect(requestGate({state: stateOf(recipe), recipe, operation: IMAGE_OUTPUT, heldFor: describedFor(recipe)})).toBeNull()
    })
})

describe('retrieving a Remapping recipe', () => {
    it('is not offered and is refused at submission while a constraint reads a band its input does not include', () => {
        const recipe = remappingOf([entry('l-1', [constraint('i-1', 'ndvi')])])
        const {output, pending} = retrieveRead(recipe)

        expect(retrieveAvailability({state: stateOf(recipe), recipe, heldFor: describedFor(recipe)}).available).toBe(false)
        expect(output.diagnostics).toEqual([{code: 'CONFIGURATION_UNMET', section: MAPPING}])
        expect(submitRetrieve({recipe, output, pending, request: request(output), task: retrieveTask})).toBe(false)
        expect(submitted).toEqual([])
    })

    it('is offered and submitted once the constraint is repaired', () => {
        const recipe = remappingOf([entry('l-1', [constraint('i-1', 'class')])])
        const {output, pending} = retrieveRead(recipe)

        expect(retrieveAvailability({state: stateOf(recipe), recipe, heldFor: describedFor(recipe)}).available).toBe(true)
        expect(submitRetrieve({recipe, output, pending, request: request(output), task: retrieveTask})).toBe(true)
        expect(submitted).toHaveLength(1)
    })
})

// Its description reads nothing of the Remapping it remaps: its class is its own legend's.
describe('a Remapping of a Remapping whose constraint no longer resolves', () => {
    it.each([
        ['an input since removed', 'i-gone', 'class'],
        ['a band its input does not include', 'i-1', 'ndvi']
    ])('reading %s is held, marked nowhere: the Remapping it remaps says why', (_case, image, band) => {
        const remapped = remappingOf([entry('l-1', [constraint(image, band)])])
        const over = remappingOver(remapped)
        const state = stateOf(over, remapped)
        const heldFor = describedFor(over, remapped)

        expect(retrieveAvailability({state, recipe: over, heldFor})).toMatchObject({available: false, gate: {read: {refusedBy: remapped.id}}})
        expect(requestGate({state, recipe: over, operation: IMAGE_OUTPUT, heldFor})).toMatchObject({withdraw: true})
        expect(sourceProblemsOfState(state, over.id, () => null, Date.now(), heldFor)).toEqual({})
    })

    it('is offered once that constraint is repaired', () => {
        const remapped = remappingOf([entry('l-1', [constraint('i-1', 'class')])])
        const over = remappingOver(remapped)
        const state = stateOf(over, remapped)
        const heldFor = describedFor(over, remapped)

        expect(retrieveAvailability({state, recipe: over, heldFor}).available).toBe(true)
        expect(requestGate({state, recipe: over, operation: IMAGE_OUTPUT, heldFor})).toBeNull()
    })
})

const MAPPING = 'process.remapping.panel.mapping.button.label'
const MISSING_INPUT = 'process.remapping.requirement.missingInput'
const BAND_NOT_INCLUDED = 'process.remapping.requirement.bandNotIncluded'
const ASSET = 'users/x/a'

const constraint = (image, band) => ({id: `${image}-${band}`, image, band, operator: '>', value: 1})

const entry = (id, constraints) => ({id, label: id, value: 1, color: '#000000', booleanOperator: 'and', constraints})

// One asset input including `class`, which the asset stores beside `ndvi`.
const remappingOf = entries => ({
    id: 'remapping-1',
    type: 'REMAPPING',
    title: 'Remapped',
    model: {
        inputImagery: {images: [{imageId: 'i-1', type: 'ASSET', id: ASSET, includedBands: [{id: 'b-class', band: 'class'}]}]},
        legend: {entries}
    }
})

// Where the Remapping it remaps assigns class 1.
const remappingOver = remapped => ({
    id: 'remapping-2',
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [{imageId: 'r-1', type: 'RECIPE_REF', id: remapped.id, includedBands: [{id: 'b-class', band: 'class'}]}]},
        legend: {entries: [entry('l-1', [constraint('r-1', 'class')])]}
    }
})

const stateOf = (...recipes) => ({
    process: {
        loadedRecipes: Object.fromEntries(recipes.map(recipe => [recipe.id, recipe])),
        recipes: recipes.map(({id}) => ({id, revision: 1})),
        recipeListing: {checkedAt: Date.now()},
        saveStates: {},
        tabs: []
    }
})

const entryProblems = (state, recipe) => Object.fromEntries(
    Object.entries(itemStatusesOfState(state, recipe.id, 'mapping', describedFor(recipe)))
        .map(([id, {message, details}]) => [id, {message, details}])
)

// What Retrieve decides from as it submits: the session read at that moment, its input asset described.
const retrieveRead = recipe =>
    readRetrieveOutput({state: stateOf(recipe), recipeId: recipe.id, heldFor: describedFor(recipe)})

// What the runtime holds once the recipe was described over these records: its input asset observed.
const describedFor = (recipe, ...records) => {
    const loadedRecipes = Object.fromEntries([recipe, ...records].map(record => [record.id, record]))
    const graph = buildMapDependencyGraph({recipe, loadedRecipes})
    const {description, diagnostics, readiness} = readImageOutput({
        graph,
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        readinessFor: ({type}) => recipeType(type),
        observationFor: ({type, id}) => type === 'ASSET' && id === ASSET
            ? {bands: ['class', 'ndvi'].map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
            : undefined
    })
    const terminal = {status: 'READY', description, diagnostics, error: null, dependencyValidity: {status: 'VALID', diagnostics: []}, readiness}
    return () => terminal
}

const request = output =>
    physicalRequest({output, retrieveOptions: {scale: 30, assetId: 'users/x/out', destination: 'GEE', useAllBands: true}})
