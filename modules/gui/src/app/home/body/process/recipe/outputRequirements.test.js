import {describe, expect, it, vi} from 'vitest'

// A requirement a recipe's output read judges (sourceRequirements.js), through the real registrations of the types
// declaring one and the shared declarations refusing their output: one refusal marks the item and the section it is
// about, holds Retrieve and withdraws previews, wherever the recipe is shown - and once repaired, none of them does.
// What the output read has not established marks and holds nothing of its own. A Classification whose classifier is
// trained is refused, too, while it holds no training data, and that is said of its Training data section. The output
// of each recipe here is described from the session alone: its input is an optical mosaic, described from its
// configuration.

vi.mock('~/translate', () => ({msg: (key, values) => {
    const name = Array.isArray(key) ? key.join('.') : key
    return values ? `${name} ${JSON.stringify(values)}` : name
}}))
// Loading the recipe types closes an import cycle through the user module's forms; nothing here reads it.
vi.mock('~/user', () => ({}))
vi.mock('~/eventPublisher', () => ({publishEvent: () => {}}))
vi.mock('~/widget/notifications', () => ({Notifications: {error: () => {}}}))
// How often the session's output is resolved, counted.
const resolutions = vi.hoisted(() => ({count: 0}))
vi.mock('#sepal/recipe/output/readImageOutput', async importOriginal => {
    const original = await importOriginal()
    return {...original, readImageOutput: (...args) => {
        resolutions.count++
        return original.readImageOutput(...args)
    }}
})

const {addRecipeType, getRecipeType} = await import('../recipeTypeRegistry')
const {default: classification} = await import('./classification/classification')
const {default: regression} = await import('./regression/regression')
const {default: unsupervisedClassification} = await import('./unsupervisedClassification/unsupervisedClassification')
const {default: stack} = await import('./stack/stack')
const {default: bandMath} = await import('./bandMath/bandMath')
const {default: remapping} = await import('./remapping/remapping')
const {default: timeSeries} = await import('./timeSeries/timeSeries')
const {inputImageryRequirements} = await import('../panels/inputImageryWithDerived/inputImageryRequirements')
const {retrieveAvailability} = await import('./operationAvailability')
const {readRetrieveOutput} = await import('./retrieveOutput')
const {OutputRegistry} = await import('../sourceRuntime/outputRegistry')
const {compatibleBasis, outputLoading} = await import('./recipeOutput')
const {NEVER, Subject} = await import('rxjs')
const {heldSourceStatusOfState, itemStatusesOf, itemStatusesOfState, sourceProblemsOfState} = await import('./selectedSourceStatus')
const {readOutputRequirements, readOutputRequirementsOfState, requestGate, requestGateOf} = await import('./sourceRequirements')
const {IMAGE_OUTPUT} = await import('./recipeOutput')

addRecipeType(classification())
addRecipeType(regression())
addRecipeType(unsupervisedClassification())
addRecipeType(stack())
addRecipeType(bandMath())
addRecipeType(remapping())
addRecipeType(timeSeries())

describe('the requirement on input band sets', () => {
    it.each(['CLASSIFICATION', 'REGRESSION', 'UNSUPERVISED_CLASSIFICATION'])('is registered by %s', type => {
        expect(getRecipeType(type).sourceRequirements).toEqual(expect.arrayContaining(inputImageryRequirements))
    })
})

describe('shared recipe-input feedback', () => {
    it.each(['STACK', 'BAND_MATH', 'REMAPPING', 'CLASSIFICATION', 'REGRESSION', 'UNSUPERVISED_CLASSIFICATION'])(
        'locates the affected reference for %s using its declared input edge', type => {
            const recipe = {id: 'dependent', type, model: {inputImagery: {images: [
                {imageId: 'healthy-row', type: 'RECIPE_REF', id: 'healthy'},
                {imageId: 'broken-row', type: 'RECIPE_REF', id: 'broken'}
            ]}}}
            const output = {status: 'READY', diagnostics: [], readiness: {status: 'NOT_READY', findings: [
                {code: 'INVALID_CALCULATION', recipePath: ['dependent', 'broken'], path: ['model', 'calculations', 'calculations', 0]}
            ]}}
            const reads = readOutputRequirements({recipe, output, recipeNames: {broken: 'Broken calculation'}})
            expect(itemStatusesOf(reads, 'inputImagery')).toEqual({
                'broken-row': expect.objectContaining({message: 'process.source.status.recipeNeedsAttention {"recipe":"Broken calculation"}'})
            })
            expect(requestGateOf(reads, IMAGE_OUTPUT)).toMatchObject({read: {outputState: true, refusedBy: 'broken'}})
        }
    )
})

// A Classification of several input images is valid by itself, but its classifier cannot be applied to a collection's
// images (MULTIPLE_CLASSIFIER_INPUTS, found only for CLASSIFIER): the recipe asking that of it is what to repair.
describe('a reference valid by itself but unsuitable for what the recipe reading it asks of it', () => {
    it('is explained at the selection asking it, as that recipe\'s requirement, naming no recipe further up to review', () => {
        const series = {id: 'series', type: 'TIME_SERIES', model: {sources: {classification: 'classification'}}}
        const output = refusing({code: MULTIPLE_CLASSIFIER_INPUTS, recipePath: ['series', 'classification'], path: INPUT_IMAGES, count: 2})

        const reads = readOutputRequirements({recipe: series, output, recipeNames: NAMES})

        expect(itemStatusesOf(reads, 'sources')).toEqual({
            'sources.classification': expect.objectContaining({
                message: 'process.source.status.multipleClassifierInputs {"recipe":"Classification","count":2}'
            })
        })
        expect(requestGateOf(reads, IMAGE_OUTPUT).read.refusedBy).toBeUndefined()
    })

    it.each([
        ['reads it', ['dependent', 'series', 'classification']],
        ['reads a recipe reading it', ['dependent', 'over', 'series', 'classification']]
    ])('is explained at an input that %s as the requirement of the recipe asking it, which is the one to review', (_case, recipePath) => {
        const recipe = stackOver(recipePath[1])
        const output = refusing({code: MULTIPLE_CLASSIFIER_INPUTS, recipePath, path: INPUT_IMAGES, count: 2})

        const reads = readOutputRequirements({recipe, output, recipeNames: NAMES})

        expect(itemStatusesOf(reads, 'inputImagery')).toEqual({
            row: expect.objectContaining({
                message: 'process.source.status.multipleClassifierInputsUpstream {"consumer":"Series","recipe":"Classification","count":2}'
            })
        })
        expect(requestGateOf(reads, IMAGE_OUTPUT)).toMatchObject({read: {refusedBy: 'series'}})
    })

    it('is explained, with its repair, in the editor of a data set reusing a recipe over it', () => {
        const recipe = reusing('provider')
        const output = refusing({code: MULTIPLE_CLASSIFIER_INPUTS, recipePath: ['dependent', 'provider', 'series', 'classification'], path: INPUT_IMAGES, count: 2})

        const reads = readOutputRequirements({recipe, output, recipeNames: NAMES})
        const {declaration, ownVerdict: {diagnostic: {item}}} = reads.find(read => read.item?.id === 'reused')

        expect(declaration.editor.message(declaration.requirement.describe({item}))).toBe(
            'process.source.status.multipleClassifierInputsUpstream {"consumer":"Series","recipe":"Classification","count":2}'
        )
    })

    it('is explained beside what else the recipe it is read through needs, each said once', () => {
        const recipe = stackOver('series')
        const unsuitable = {code: MULTIPLE_CLASSIFIER_INPUTS, recipePath: ['dependent', 'series', 'classification'], path: INPUT_IMAGES, count: 2}
        const output = {status: 'READY', diagnostics: [], readiness: {status: 'NOT_READY', findings: [
            unsuitable,
            unsuitable,
            {code: 'INVALID_CALCULATION', recipePath: ['dependent', 'series', 'over'], path: INPUT_IMAGES}
        ]}}

        const reads = readOutputRequirements({recipe, output, recipeNames: NAMES})

        expect(itemStatusesOf(reads, 'inputImagery')).toEqual({
            row: expect.objectContaining({message: [
                'process.source.status.multipleClassifierInputsUpstream {"consumer":"Series","recipe":"Classification","count":2}',
                'process.source.status.recipeBlockedBy {"recipe":"Series","origins":"Over"}'
            ].join(' ')})
        })
    })

    it('leaves a recipe further up that is unsound by itself the one to review', () => {
        const recipe = stackOver('series')
        const output = refusing({code: 'INVALID_CALCULATION', recipePath: ['dependent', 'series', 'classification'], path: INPUT_IMAGES})

        const reads = readOutputRequirements({recipe, output, recipeNames: NAMES})

        expect(itemStatusesOf(reads, 'inputImagery')).toEqual({
            row: expect.objectContaining({message: 'process.source.status.recipeBlockedBy {"recipe":"Series","origins":"Classification"}'})
        })
        expect(requestGateOf(reads, IMAGE_OUTPUT)).toMatchObject({read: {refusedBy: 'classification'}})
    })
})

// A recipe asked for an operation its type does not provide (UNDECLARED_OPERATION) is valid by itself: its image runs.
describe('a reference asked for what its type does not provide', () => {
    it('is explained at the data set reusing it, and in its editor, as what that data set needs, naming no recipe to fix', () => {
        const recipe = reusing('mosaic')
        const output = refusing({code: 'UNDECLARED_OPERATION', operation: 'TRAINING_DATA', path: [], recipePath: ['dependent', 'mosaic']})

        const reads = readOutputRequirements({recipe, output, recipeNames: NAMES})
        const {declaration, ownVerdict: {diagnostic: {item}}} = reads.find(read => read.item?.id === 'reused')

        const said = 'process.source.status.providesNoTrainingData {"recipe":"Working mosaic"}'
        expect(itemStatusesOf(reads, 'trainingData')).toEqual({reused: expect.objectContaining({message: said})})
        expect(declaration.editor.message(declaration.requirement.describe({item}))).toBe(said)
        expect(requestGateOf(reads, IMAGE_OUTPUT).read.refusedBy).toBeUndefined()
    })

    it('is explained at an input selecting a recipe that makes no image, as what that input needs', () => {
        const output = refusing({code: 'NON_IMAGE_OUTPUT', path: [], recipePath: ['dependent', 'design']})

        const reads = readOutputRequirements({recipe: stackOver('design'), output, recipeNames: NAMES})

        expect(itemStatusesOf(reads, 'inputImagery')).toEqual({
            row: expect.objectContaining({message: 'process.source.status.providesNoImage {"recipe":"Design"}'})
        })
        expect(requestGateOf(reads, IMAGE_OUTPUT).read.refusedBy).toBeUndefined()
    })

    it('is explained at an input reading the recipe asking it, which is the one to review', () => {
        const recipe = stackOver('series')
        const output = refusing({code: 'UNDECLARED_OPERATION', operation: 'CLASSIFIER', path: [], recipePath: ['dependent', 'series', 'mosaic']})

        const reads = readOutputRequirements({recipe, output, recipeNames: NAMES})

        expect(itemStatusesOf(reads, 'inputImagery')).toEqual({
            row: expect.objectContaining({message: 'process.source.status.providesNoClassifierUpstream {"consumer":"Series","recipe":"Working mosaic"}'})
        })
        expect(requestGateOf(reads, IMAGE_OUTPUT)).toMatchObject({read: {refusedBy: 'series'}})
    })
})

// A finding refusing only the use asked (it names the `operation`), for a reason feedback has no explanation of, is said
// without blaming either recipe.
describe('a reference refused for that use alone, for a reason feedback does not know', () => {
    it('is said to be unusable here, not to need attention, where it is selected', () => {
        const recipe = reusing('mosaic')
        const output = refusing({code: 'UNKNOWN_REASON', operation: 'TRAINING_DATA', path: [], recipePath: ['dependent', 'mosaic']})

        const reads = readOutputRequirements({recipe, output, recipeNames: NAMES})
        const {declaration, ownVerdict: {diagnostic: {item}}} = reads.find(read => read.item?.id === 'reused')

        const said = 'process.source.status.recipeUnusable {"recipe":"Working mosaic"}'
        expect(itemStatusesOf(reads, 'trainingData')).toEqual({reused: expect.objectContaining({message: said})})
        expect(declaration.editor.message(declaration.requirement.describe({item}))).toBe(said)
        expect(requestGateOf(reads, IMAGE_OUTPUT).read.refusedBy).toBeUndefined()
    })

    it('names the recipe further up that cannot use it, as the one to review', () => {
        const output = refusing({code: 'UNKNOWN_REASON', operation: 'CLASSIFIER', path: [], recipePath: ['dependent', 'series', 'classification']})

        const reads = readOutputRequirements({recipe: stackOver('series'), output, recipeNames: NAMES})

        expect(itemStatusesOf(reads, 'inputImagery')).toEqual({
            row: expect.objectContaining({message: 'process.source.status.recipeUnusableUpstream {"consumer":"Series","recipe":"Classification"}'})
        })
        expect(requestGateOf(reads, IMAGE_OUTPUT)).toMatchObject({read: {refusedBy: 'series'}})
    })
})

describe('a recipe whose output read refuses an input\'s band set', () => {
    it('is marked on that input and its section, and Retrieve and its previews are held, saying which section', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red', 'elevation']), image('image-2', MOSAIC, ['nir'])]))

        expect(itemProblems(state)).toEqual({'image-1': MISSING})
        expect(sourceProblems(state).inputImagery).toBe(UNAVAILABLE_SUMMARY)
        expect(retrieve(state)).toMatchObject({available: false, gate: {code: 'CONFIGURATION_UNMET', section: SECTION}})
        expect(previewGate(state)).toMatchObject({withdraw: true, code: 'CONFIGURATION_UNMET', section: SECTION})
        expect(heldSourceStatusOfState(state, recipeOf(state), previewGate(state))).toMatchObject({section: SECTION})
        expect(retrieveRead(state).output.diagnostics).toEqual([{code: 'CONFIGURATION_UNMET', section: SECTION}])
    })

    it('is said to need another band where a band combination is all that is wrong, and is marked so', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red'], [ratio('nir')])]))

        expect(itemProblems(state)).toEqual({'image-1': INCOMPLETE})
        expect(sourceProblems(state).inputImagery).toBe(INCOMPLETE)
        expect(retrieve(state).available).toBe(false)
    })

    it('is said to have unavailable bands where one is, beside an incomplete band combination', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red'], [ratio('nir')]), image('image-2', MOSAIC, ['elevation'])]))

        expect(itemProblems(state)).toEqual({'image-1': INCOMPLETE, 'image-2': MISSING})
        expect(sourceProblems(state).inputImagery).toBe(UNAVAILABLE_SUMMARY)
    })

    it('is held by a refusal established beside an input not yet described', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['elevation']), image('image-2', ASSET, ['red'])]))

        expect(itemProblems(state)).toEqual({'image-1': MISSING})
        expect(retrieve(state).available).toBe(false)
        expect(previewGate(state)).toMatchObject({withdraw: true})
    })

    it('stays marked and held once another input\'s asset is found missing', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['elevation']), image('image-2', ASSET, ['red'])]), {
            assets: {[ASSET.id]: {version: null, checkedAt: Date.now(), changedAt: null, failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}}}
        })

        expect(itemProblems(state)).toEqual({'image-1': MISSING})
        expect(sourceProblems(state).inputImagery).toBeDefined()
        expect(retrieve(state)).toMatchObject({available: false, gate: {code: 'CONFIGURATION_UNMET'}})
        expect(previewGate(state)).toMatchObject({withdraw: true, code: 'CONFIGURATION_UNMET'})
    })

    it('is read once for every consumer, Retrieve and the runtime\'s watch included, while its records stay as they were', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['elevation']), image('image-2', ASSET, ['red'])]))
        const watch = runtimeWatching(state)
        const reads = readOutputRequirementsOfState({state, recipe: recipeOf(state), heldFor})
        retrieveRead(state)
        const resolved = resolutions.count

        const unrelated = unrelatedEditOf(state)
        watch.sessionIs(unrelated)
        itemProblems(unrelated)
        sourceProblems(unrelated)
        retrieve(unrelated)
        previewGate(unrelated)
        retrieveRead(unrelated)

        expect(resolutions.count).toBe(resolved)
        expect(readOutputRequirementsOfState({state: unrelated, recipe: recipeOf(unrelated), heldFor})).toBe(reads)
    })

    it('is read again once a record its output reads changes, and says what that record now establishes', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['elevation'])]))
        const watch = runtimeWatching(state)
        itemProblems(state)
        const resolved = resolutions.count

        const repaired = withRecipe(state, {...recipeOf(state), model: modelOf([image('image-1', MOSAIC, ['red'])])})
        watch.sessionIs(repaired)
        expect(itemProblems(repaired)).toEqual({})
        const reloaded = withRecipe(repaired, {...MOSAIC, model: {...MOSAIC.model, sources: {dataSets: {SENTINEL_2: ['SENTINEL_2']}, cloudPercentageThreshold: 100}}})
        itemProblems(reloaded)

        expect(resolutions.count).toBe(resolved + 2)
    })
})

describe('a recipe whose output read refuses nothing', () => {
    it('once repaired, is marked nowhere, and nothing holds its operations for its band sets', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red'])]))

        expect(itemProblems(state)).toEqual({})
        expect(sourceProblems(state)).toEqual({})
        expect(retrieve(state)).toEqual({available: true, gate: null})
        expect(previewGate(state)).toBeNull()
        expect(retrieveRead(state).output.status).toBe('READY')
    })

    it('while an input is not yet described, is marked nowhere, and Retrieve and new previews wait for it', () => {
        const state = sessionWith(modelOf([image('image-1', ASSET, ['elevation'])]))

        expect(itemProblems(state)).toEqual({})
        expect(sourceProblems(state)).toEqual({})
        expect(retrieve(state)).toMatchObject({available: false, gate: {wait: true, code: 'SOURCE_PENDING', section: SECTION}})
        expect(previewGate(state)).toMatchObject({wait: true, withdraw: false})
        expect(retrieveRead(state).output.status).toBe('NEEDS_EVIDENCE')
    })

    it('once an input cannot be read, is marked nowhere, and Retrieve is held as unavailable', () => {
        const state = sessionWith(modelOf([image('image-1', ASSET, ['elevation'])]))
        const failed = key => key.kind === 'DESCRIBE'
            ? {status: 'UNAVAILABLE', diagnostics: [], error: new Error('Earth Engine unreachable'), basis: [], assets: [ASSET.id]}
            : null

        expect(itemProblems(state, failed)).toEqual({})
        expect(sourceProblems(state, failed)).toEqual({})
        expect(retrieve(state, failed)).toMatchObject({available: false, gate: {wait: false, code: 'SOURCE_UNAVAILABLE'}})
    })
})

// No training data at all is set-up not yet done: neither type's Training data button is marked for it, while what it holds
// is held all the same.
describe('a Classification without training data', () => {
    it('leaves its Training data section unmarked, while Retrieve and its previews are held, naming that section', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red'])], {trainingData: NO_TRAINING_DATA}))

        expect(sourceProblems(state)).toEqual({})
        expect(retrieve(state)).toMatchObject({available: false, gate: {code: 'CONFIGURATION_UNMET', section: TRAINING_DATA_SECTION}})
        expect(previewGate(state)).toMatchObject({withdraw: true, code: 'CONFIGURATION_UNMET', section: TRAINING_DATA_SECTION})
        expect(heldSourceStatusOfState(state, recipeOf(state), previewGate(state))).toMatchObject({section: TRAINING_DATA_SECTION})
        expect(retrieveRead(state).output.diagnostics).toEqual([{code: 'CONFIGURATION_UNMET', section: TRAINING_DATA_SECTION}])
    })

    it('beside an input lacking a band, is marked on its input imagery alone', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['elevation'])], {trainingData: NO_TRAINING_DATA}))

        expect(sourceProblems(state)).toEqual({inputImagery: UNAVAILABLE_SUMMARY})
        expect(retrieve(state)).toMatchObject({available: false, gate: {code: 'CONFIGURATION_UNMET'}})
    })

    it('is held by nothing where its classifier is a supplied decision tree', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red'])], {
            trainingData: NO_TRAINING_DATA,
            classifier: {type: 'DECISION_TREE', decisionTree: '1) root 9 0 0 (0 1) *'}
        }))

        expect(sourceProblems(state)).toEqual({})
        expect(retrieve(state)).toEqual({available: true, gate: null})
        expect(previewGate(state)).toBeNull()
    })
})

describe('a Regression without training data', () => {
    it('leaves its Training data section unmarked, while Retrieve and its previews are held, naming that section', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red'])], {trainingData: {dataSets: []}}), {type: 'REGRESSION'})

        expect(sourceProblems(state)).toEqual({})
        expect(retrieve(state)).toMatchObject({available: false, gate: {code: 'CONFIGURATION_UNMET', section: TRAINING_DATA_SECTION}})
        expect(previewGate(state)).toMatchObject({withdraw: true, code: 'CONFIGURATION_UNMET', section: TRAINING_DATA_SECTION})
    })
})

// Every recipe zipping its input images needs one at least: none is said on Input imagery, and holds what the output
// read finds it keeps from running, there and in every recipe over it. An input whose source is found gone is said as
// that instead.
describe('a recipe without input imagery', () => {
    it.each([
        ['CLASSIFICATION', SECTION],
        ['REGRESSION', SECTION],
        ['UNSUPERVISED_CLASSIFICATION', SECTION],
        ['STACK', IMAGERY_SECTION],
        // Its output bands, which it has none of either, are what its type declares first.
        ['BAND_MATH', 'process.bandMath.panel.outputBands.button'],
        ['REMAPPING', IMAGERY_SECTION]
    ])('of type %s is marked on Input imagery, saying to add an image, and Retrieve and its previews are held, naming %s', (type, section) => {
        const state = sessionWith(emptyModels[type](), {type})

        expect(sourceProblems(state)).toMatchObject({inputImagery: NO_IMAGERY})
        expect(retrieve(state).available).toBe(false)
        expect(previewGate(state)).toMatchObject({withdraw: true, code: 'CONFIGURATION_UNMET'})
        expect(retrieveRead(state).output.readiness.findings).toContainEqual(expect.objectContaining({code: 'MISSING_ROLE'}))
        expect(retrieve(state).gate.section).toBe(section)
    })

    it('of type BAND_MATH keeps its Output bands marked for having none, beside it', () => {
        const state = sessionWith(emptyModels.BAND_MATH(), {type: 'BAND_MATH'})

        expect(Object.keys(sourceProblems(state)).sort()).toEqual(['inputImagery', 'outputBands'])
    })

    it('holds a Remapping over it and marks its input reference, keeping the diagnosis upstream', () => {
        const over = remappingOver(ID)
        const state = {...sessionWith(emptyModels.CLASSIFICATION()), process: {
            ...sessionWith(emptyModels.CLASSIFICATION()).process,
            loadedRecipes: {...sessionWith(emptyModels.CLASSIFICATION()).process.loadedRecipes, [over.id]: over}
        }}

        expect(retrieveAvailability({state, recipe: over, heldFor, now: Date.now()}).available).toBe(false)
        expect(requestGate({state, recipe: over, operation: IMAGE_OUTPUT, heldFor, now: Date.now()})).toMatchObject({withdraw: true})
        expect(sourceProblemsOfState(state, over.id, () => null, Date.now(), heldFor)).toEqual({
            inputImagery: 'process.source.status.recipeNeedsAttention {"recipe":"Land cover"}'
        })
    })

    it('is not what an input whose asset is found missing is said to be', () => {
        const state = sessionWith(modelOf([image('image-1', ASSET, ['elevation'])]), {
            assets: {[ASSET.id]: {version: 'v1', checkedAt: 0, failure: {kind: 'DEFINITIVE', code: 'NOT_FOUND'}}}
        })

        expect(sourceProblems(state).inputImagery).not.toBe(NO_IMAGERY)
        expect(retrieveRead(state).output.diagnostics).toContainEqual({code: 'ASSET_UNAVAILABLE', assetId: ASSET.id})
        expect(retrieveRead(state).output.readiness?.findings || []).not.toContainEqual(expect.objectContaining({code: 'MISSING_ROLE'}))
    })
})

// A finding one declaration locates at an item holds the operations that declaration does. Another declaration, finding
// nothing of its own, holds them again only where the located finding does not: its hold on any other operation stays.
describe('a finding one declaration locates, beside another declaration', () => {
    it.each([
        ['holding only what the located finding holds, is not held again', 'ONLY_IMAGE', {operations: ['IMAGE_OUTPUT']}, []],
        ['holding another operation too, still holds it', 'ALSO_SEGMENTS', {operations: ['IMAGE_OUTPUT', 'PIXEL_SEGMENTS']}, ['OTHER']],
        ['naming another only through its provider, which no finding holds, is not held again', 'PROVIDER_SEGMENTS',
            {operations: ['IMAGE_OUTPUT'], providerOperations: ['PIXEL_SEGMENTS']}, []]
    ])('%s', (_case, type, holds, generic) => {
        addRecipeType({id: type, imageSource: true, sourceRequirements: [LOCATING, {...OTHER, ...holds}]})
        const recipe = {id: 'located-1', type, model: {}}

        const reads = readOutputRequirements({recipe, output: LOCATED_FINDING})

        expect(reads.filter(({outputState}) => outputState).map(({declaration}) => declaration.id)).toEqual(generic)
        expect(requestGateOf(reads, 'IMAGE_OUTPUT')).toMatchObject({code: 'CONFIGURATION_UNMET', section: 'located'})
        expect(Boolean(requestGateOf(reads, 'PIXEL_SEGMENTS'))).toBe(generic.length > 0)
    })
})

describe('the requirements of a type its output read judges', () => {
    it('are not read without the source runtime\'s answers', () => {
        const state = sessionWith(modelOf([image('image-1', MOSAIC, ['red'])]))

        expect(() => requestGate({state, recipe: recipeOf(state), operation: IMAGE_OUTPUT, now: Date.now()})).toThrow()
    })
})

const MULTIPLE_CLASSIFIER_INPUTS = 'MULTIPLE_CLASSIFIER_INPUTS'

const INPUT_IMAGES = ['model', 'inputImagery', 'images']

const NAMES = {series: 'Series', classification: 'Classification', over: 'Over', mosaic: 'Working mosaic', provider: 'Provider', design: 'Design'}

// A Classification whose one data set reuses `id`.
const reusing = id => ({id: 'dependent', type: 'CLASSIFICATION', model: {
    inputImagery: {images: []},
    trainingData: {dataSets: [{dataSetId: 'reused', type: 'RECIPE', name: NAMES[id], recipe: id}]}
}})

// A Stack whose one input is `id`.
const stackOver = id => ({id: 'dependent', type: 'STACK', model: {inputImagery: {images: [{imageId: 'row', type: 'RECIPE_REF', id}]}}})

// An output read refused for `finding` alone.
const refusing = finding => ({status: 'READY', diagnostics: [], readiness: {status: 'NOT_READY', findings: [finding]}})

const declaration = (id, codes, itemOf) => ({
    id,
    section: {id: id.toLowerCase(), label: id.toLowerCase()},
    requirement: {id, describe: () => ({message: id, details: []})},
    outputDiagnostics: {codes, itemOf}
})

const LOCATING = {
    ...declaration('LOCATED', ['LOCATED_CODE'], () => ({id: 'item-1', path: ['model', 'located'], label: 'Item'})),
    operations: ['IMAGE_OUTPUT']
}

const OTHER = declaration('OTHER', ['ELSEWHERE_CODE'], () => null)

// An output described and kept from running by what one declaration locates.
const LOCATED_FINDING = {
    status: 'READY',
    diagnostics: [],
    error: null,
    dependencyValidity: {status: 'VALID', diagnostics: []},
    readiness: {
        status: 'NOT_READY',
        findings: [{code: 'LOCATED_CODE', path: ['model', 'located'], recipePath: ['located-1']}],
        needs: {records: [], observations: []}
    }
}

const ID = 'classification-1'
const SECTION = 'process.classification.panel.inputImagery.button'
const MISSING = 'process.classification.panel.inputImagery.unavailableSelections.input'
const UNAVAILABLE_SUMMARY = 'process.classification.panel.inputImagery.unavailableSelections.inputs'
const INCOMPLETE = 'process.classification.panel.inputImagery.unavailableSelections.incompleteCombination'
const TRAINING_DATA_SECTION = 'process.classification.panel.trainingData.button'
const IMAGERY_SECTION = 'process.panels.inputImagery.button'
const NO_IMAGERY = 'process.panels.inputImagery.form.noImagery'

const MOSAIC = {
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}
const ASSET = {id: 'users/x/covariates', type: 'ASSET'}

const image = (imageId, source, included, otherSets = []) => ({
    imageId,
    type: source.type === 'ASSET' ? 'ASSET' : 'RECIPE_REF',
    id: source.id,
    bandSetSpecs: [{id: 'image-bands', type: 'IMAGE_BANDS', included}, ...otherSets]
})

const ratio = (...included) => ({id: 'ratio', type: 'PAIR_WISE_EXPRESSION', operation: 'RATIO', included})

// Trained on points collected on the map, unless a test says otherwise.
const modelOf = (images, model = {}) => ({
    inputImagery: {images},
    legend: {entries: [{id: 'entry-1', value: 1, label: 'Forest', color: '#000000'}]},
    trainingData: {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', referenceData: [{x: 0.5, y: 0.5, class: 1}]}]},
    classifier: {type: 'RANDOM_FOREST'},
    ...model
})

const NO_TRAINING_DATA = {dataSets: [{dataSetId: 'collected', type: 'COLLECTED', referenceData: []}]}

// Each type's configuration, its input list empty.
const emptyModels = {
    CLASSIFICATION: () => modelOf([]),
    REGRESSION: () => modelOf([], {trainingData: {dataSets: [{dataSetId: 'plots', type: 'EE_TABLE', referenceData: [{x: 0.5, y: 0.5, value: 112.4}]}]}}),
    UNSUPERVISED_CLASSIFICATION: () => ({inputImagery: {images: []}, clusterer: {type: 'KMEANS', numberOfClusters: 5}}),
    STACK: () => ({inputImagery: {images: []}, bandNames: {bandNames: []}}),
    BAND_MATH: () => ({inputImagery: {images: []}, calculations: {calculations: []}, outputBands: {outputImages: []}}),
    REMAPPING: () => ({inputImagery: {images: []}, legend: {entries: [{id: 'l-1', value: 1, label: 'Forest', color: '#000000', constraints: []}]}})
}

// Forest, where the recipe it remaps classifies 1.
const remappingOver = id => ({
    id: 'remapping-1',
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [{imageId: 'r-1', type: 'RECIPE_REF', id, includedBands: [{id: 'b-class', band: 'class'}]}]},
        legend: {entries: [{id: 'l-1', value: 1, label: 'Forest', color: '#000000', booleanOperator: 'and',
            constraints: [{id: 'c-1', image: 'r-1', band: 'class', operator: '=', value: 1}]}]}
    }
})

const sessionWith = (model, {assets = {}, type = 'CLASSIFICATION'} = {}) => ({
    process: {
        loadedRecipes: {[ID]: {id: ID, type, model}, [MOSAIC.id]: MOSAIC},
        recipes: [{id: ID, name: 'Land cover'}, {id: MOSAIC.id, name: 'Covariates'}],
        recipeListing: {checkedAt: Date.now()},
        assetEvidence: {generation: 0, assets}
    }
})

const recipeOf = state => state.process.loadedRecipes[ID]

// The session with another recipe edited, the map resized and an output settled elsewhere: nothing this recipe reads.
const unrelatedEditOf = state => ({
    ...state,
    dimensions: {width: 800, height: 600},
    process: {
        ...state.process,
        loadedRecipes: {...state.process.loadedRecipes, 'other-1': {id: 'other-1', type: 'MOSAIC', model: {}}},
        sourceOutputSettlements: (state.process.sourceOutputSettlements || 0) + 1
    }
})

const withRecipe = (state, recipe) => ({
    ...state,
    process: {...state.process, loadedRecipes: {...state.process.loadedRecipes, [recipe.id]: recipe}}
})

// The runtime's output registry watching the recipe's output as its requirements read it, over a session the test
// replaces; the work it starts never settles.
const runtimeWatching = initial => {
    let session = initial
    const changes = new Subject()
    const registry = new OutputRegistry({
        session: () => ({catalogue: session.process.loadedRecipes, credentials: null, closed: false}),
        sessionChanges$: changes,
        acquisitionOf: outputLoading,
        operationOf: () => NEVER,
        isCompatible: compatibleBasis
    })
    registry.watchOutput$({recipeId: ID, product: {name: IMAGE_OUTPUT}, explain: true}).subscribe()
    return {
        sessionIs: state => {
            session = state
            changes.next()
        }
    }
}

// The session answers alone here: the runtime holds nothing.
const heldFor = () => null

const itemProblems = (state, held = heldFor) => Object.fromEntries(Object.entries(itemStatusesOfState(state, ID, 'inputImagery', held))
    .map(([id, {message}]) => [id, message]))

const sourceProblems = (state, held = heldFor) => sourceProblemsOfState(state, ID, () => null, Date.now(), held)

const retrieve = (state, held = heldFor) => retrieveAvailability({state, recipe: recipeOf(state), heldFor: held, now: Date.now()})

const previewGate = state => requestGate({state, recipe: recipeOf(state), operation: IMAGE_OUTPUT, heldFor, now: Date.now()})

const retrieveRead = state => readRetrieveOutput({state, recipeId: ID, heldFor})
