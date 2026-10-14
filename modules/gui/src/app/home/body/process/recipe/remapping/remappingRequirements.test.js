import {beforeEach, describe, expect, it, vi} from 'vitest'

// What Remapping's mapping needs of its own configuration as applied - each constraint reads an input still there, and a
// band that input includes - and what holds its image output back by it: Retrieve, offered and submitted, through the
// real registration, shared declaration, common read and generic submission. Only the task API is replaced.

vi.mock('~/translate', () => ({msg: key => key}))
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
const {BAND_NOT_INCLUDED, MISSING_INPUT} = await import('./remappingRequirements')
const {buildMapDependencyGraph} = await import('../mapDependencyGraph')
const {IMAGE_OUTPUT} = await import('../recipeOutput')
const {physicalRequest, readRetrieveOutput, submitRetrieve} = await import('../retrieveOutput')
const {retrieveAvailability} = await import('../operationAvailability')
const {configurationGate, readLocalRequirements, SUPPORTED} = await import('../sourceRequirements')

addRecipeType(remapping())

beforeEach(() => {
    submitted.length = 0
})

describe('a legend entry\'s constraints', () => {
    it('are each judged by the input they read and the bands that input includes', () => {
        const recipe = remappingOf([
            entry('valid', [constraint('i-1', 'class')]),
            entry('removed', [constraint('i-gone', 'class')]),
            entry('notIncluded', [constraint('i-1', 'ndvi'), constraint('i-1', 'class')])
        ])

        const verdicts = Object.fromEntries(readLocalRequirements(recipe).map(read => [read.item.id, read.verdict]))

        expect(verdicts.valid.status).toEqual(SUPPORTED)
        expect(verdicts.removed.diagnostic.problems).toEqual([{code: MISSING_INPUT}])
        expect(verdicts.notIncluded.diagnostic.problems).toEqual([{code: BAND_NOT_INCLUDED, band: 'ndvi'}])
    })

    it.each([
        ['an input since removed', 'i-gone', 'class'],
        ['a band its input does not include', 'i-1', 'ndvi']
    ])('hold back the image output while one reads %s, by Mapping', (_case, image, band) => {
        const recipe = remappingOf([entry('l-1', [constraint(image, band)])])

        expect(configurationGate({recipe, operation: IMAGE_OUTPUT}))
            .toMatchObject({code: 'CONFIGURATION_UNMET', section: MAPPING, withdraw: true})
    })

    it('hold back nothing once each reads a band its input includes', () => {
        const recipe = remappingOf([entry('l-1', [constraint('i-1', 'class')])])

        expect(configurationGate({recipe, operation: IMAGE_OUTPUT})).toBeNull()
    })
})

describe('retrieving a Remapping recipe', () => {
    it('is not offered and is refused at submission while a constraint reads a band its input does not include', () => {
        const recipe = remappingOf([entry('l-1', [constraint('i-1', 'ndvi')])])
        const {output, pending} = retrieveRead(recipe)

        expect(retrieveAvailability({state: stateOf(recipe), recipe}).available).toBe(false)
        expect(output.diagnostics).toEqual([{code: 'CONFIGURATION_UNMET', section: MAPPING}])
        expect(submitRetrieve({recipe, output, pending, request: request(output), task: retrieveTask})).toBe(false)
        expect(submitted).toEqual([])
    })

    it('is offered and submitted once the constraint is repaired', () => {
        const recipe = remappingOf([entry('l-1', [constraint('i-1', 'class')])])
        const {output, pending} = retrieveRead(recipe)

        expect(retrieveAvailability({state: stateOf(recipe), recipe}).available).toBe(true)
        expect(submitRetrieve({recipe, output, pending, request: request(output), task: retrieveTask})).toBe(true)
        expect(submitted).toHaveLength(1)
    })
})

const MAPPING = 'process.remapping.panel.mapping.button.label'
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

const stateOf = recipe => ({
    process: {
        loadedRecipes: {[recipe.id]: recipe},
        recipes: [{id: recipe.id, revision: 1}],
        recipeListing: {checkedAt: Date.now()},
        saveStates: {},
        tabs: []
    }
})

// What Retrieve decides from as it submits: the session read at that moment, its input asset described.
const retrieveRead = recipe => {
    const graph = buildMapDependencyGraph({recipe, loadedRecipes: {[recipe.id]: recipe}})
    const {description, diagnostics, readiness} = readImageOutput({
        graph,
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        readinessFor: ({type}) => recipeType(type),
        observationFor: ({type, id}) => type === 'ASSET' && id === ASSET
            ? {bands: ['class', 'ndvi'].map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
            : undefined
    })
    const terminal = {status: 'READY', description, diagnostics, error: null, dependencyValidity: {status: 'VALID', diagnostics: []}, readiness}
    return readRetrieveOutput({state: stateOf(recipe), recipeId: recipe.id, heldFor: () => terminal})
}

const request = output =>
    physicalRequest({output, retrieveOptions: {scale: 30, assetId: 'users/x/out', destination: 'GEE', useAllBands: true}})
