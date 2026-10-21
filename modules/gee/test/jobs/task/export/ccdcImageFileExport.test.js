import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {defer, lastValueFrom, of, throwError} from 'rxjs'

// A direct CCDC exported to Drive or the SEPAL workspace, held to what the bands it is asked for need of its
// Classification. Recipe reads, image construction, the destination and Earth Engine are substituted; resolution, the
// declarations and readiness are the real ones.
//
// The substituted Earth Engine accepts any image, so an export started here shows that readiness released it, not that a
// Drive or SEPAL file can hold a CCDC's array bands: that is not established by these routes, nor judged here.

const state = {}

const ALICE = {username: 'alice'}
const CONTEXT = {requestId: 'r-1', username: 'alice', origin: 'task', auth: {type: 'user'}, projectId: 'p', workloadTag: 't', endpoint: 'https://ee'}
const CLASSIFICATION = 'classification-1'
const PROVIDER = 'provider-1'
const SVM = {type: 'SVM', svmType: 'C_SVC'}
const POINTS = [{x: 1, y: 1, class: 1}, {x: 1, y: 2, class: 1}, {x: 2, y: 1, class: 2}, {x: 2, y: 2, class: 2}]
const MEASURES = ['ndvi', 'regression', 'probability_1']
const ROUTES = [
    ['Drive', async () => (await import('#gee/jobs/task/export/imageDriveExport')).startImageDriveExport$,
        {driveFolder: 'exports-1'}],
    ['the SEPAL workspace', async () => (await import('#gee/jobs/task/export/imageWorkspaceExport')).startImageWorkspaceExport$,
        {filenamePrefix: 'prefix', workspacePath: 'x'}]
]

for (const [destination, route, options] of ROUTES) {
    const exportTo = async ({recipe, bands}) => {
        const {inEEContext} = await import('#sepal/ee/eeContext')
        const start$ = await route()
        const image = {recipe, ...(bands && {bands: {selection: bands}}), scale: 30, ...options}
        return lastValueFrom(inEEContext(CONTEXT, start$({image}, {sepalUser: ALICE})))
    }

    // Exporting a CCDC's physical bands fits the measures they are built from (measuresFor) with its breakpoint bands. A
    // measure its Classification computes trains that Classification, so what training needs refuses the export before
    // its image is built, a destination prepared or an export started - after what the CCDC's configuration requires,
    // and after the outputs asked for being ones the Classification provides.
    describe(`exporting the bands of a CCDC to ${destination}, where its Classification computes some of them`, () => {
        for (const [_case, catalogue, code] of [
            ['stores no points', () => ({[CLASSIFICATION]: trainable({points: []})}), 'NO_TRAINING_DATA'],
            ['reuses a recipe without input imagery', () => ({[CLASSIFICATION]: trainable({reuses: [PROVIDER]}), [PROVIDER]: trainable({id: PROVIDER, images: []})}), 'MISSING_ROLE'],
            ['reuses a recipe sampling fewer features', () => ({[CLASSIFICATION]: trainable({reuses: [PROVIDER]}), [PROVIDER]: trainable({id: PROVIDER, included: ['red']})}), 'MISSING_TRAINING_FEATURES']
        ]) {
            it(`is refused, building nothing, for a coefficient band where the Classification ${_case}`, async () => {
                state.catalogue = catalogue()

                await assert.rejects(exportTo({recipe: ccdcOf(), bands: ['probability_1_coefs']}), new RegExp(`ccdc-1 cannot run: ${code}$`))

                assertNothingStarted()
            })

            it(`exports bands of measures of the images, observing nothing of the Classification's input, where it ${_case}`, async () => {
                state.catalogue = catalogue()

                await exportTo({recipe: ccdcOf(), bands: ['ndvi_coefs', 'tStart']})

                assert.deepEqual(state.observed.filter(id => id.endsWith('-input')), [])
                assert.equal(state.started.length, 1)
            })
        }

        for (const bands of [['probability_1_rmse'], ['probability_1_magnitude'], ['ndvi_coefs', 'probability_1_magnitude']]) {
            it(`is refused, building nothing, for ${bands.join(' and ')} where the Classification stores no points`, async () => {
                state.catalogue = {[CLASSIFICATION]: trainable({points: []})}

                await assert.rejects(exportTo({recipe: ccdcOf(), bands}), /ccdc-1 cannot run: NO_TRAINING_DATA$/)

                assertNothingStarted()
            })
        }

        for (const [_case, bands] of [['timing bands alone', ['tStart', 'tBreak', 'changeProb']], ['no bands', []], ['no selection', undefined]]) {
            it(`exports ${_case} while the Classification stores no points`, async () => {
                state.catalogue = {[CLASSIFICATION]: trainable({points: []})}

                await exportTo({recipe: ccdcOf(), bands})

                assert.deepEqual(state.productFactories, ['ccdc-1'])
                assert.equal(state.started.length, 1)
            })
        }

        for (const [_case, classifier, bands] of [
            ['a band of the images', undefined, ['ndvi_coefs']],
            ['an output the Classification does not provide', SVM, ['regression_coefs']]
        ]) {
            it(`is refused for a classified breakpoint band's training before ${_case}`, async () => {
                state.catalogue = {[CLASSIFICATION]: trainable({points: [], classifier})}

                await assert.rejects(exportTo({recipe: ccdcOf(['ndvi', 'probability_1']), bands}), /ccdc-1 cannot run: NO_TRAINING_DATA$/)

                assertNothingStarted()
            })
        }

        it('exports once the Classification stores points again, over the CCDC\'s own region', async () => {
            const recipe = ccdcOf()
            state.catalogue = {[CLASSIFICATION]: trainable({points: []})}
            await assert.rejects(exportTo({recipe, bands: ['probability_1_coefs']}), /NO_TRAINING_DATA$/)

            state.catalogue = {[CLASSIFICATION]: trainable()}
            await exportTo({recipe, bands: ['probability_1_coefs', 'probability_1_rmse']})

            assert.deepEqual(state.productFactories, [recipe.id])
            assert.equal(state.prepared.length, 1)
            assert.equal(state.started.length, 1)
            assert.partialDeepStrictEqual(state.started[0], {image: {builtFrom: recipe.id}, region: 'region', scale: 30})
        })

        it('fails with what could not be read, as no finding and building nothing, where the Classification\'s input cannot be observed', async () => {
            state.catalogue = {[CLASSIFICATION]: trainable()}
            delete state.assets[inputOf(CLASSIFICATION)]

            await assert.rejects(
                exportTo({recipe: ccdcOf(), bands: ['probability_1_coefs']}),
                /cannot run: what it needs could not be read: Asset could not be read: users\/x\/classification-1-input$/
            )

            assertNothingStarted()
        })

        for (const [_case, untrained] of [['can be trained', {}], ['stores no points', {points: []}]]) {
            it(`is refused for an output its Classification does not provide as a client's error, building nothing, where it ${_case}`, async () => {
                state.catalogue = {[CLASSIFICATION]: trainable({...untrained, classifier: SVM})}

                await assert.rejects(exportTo({recipe: ccdcOf(), bands: ['ndvi_coefs', 'regression_coefs']}), error =>
                    error.errorCode === 'UNSUPPORTED_CLASSIFIED_OUTPUT' && error.statusCode === 400
                    && error.message === 'Classification classification-1 does not provide regression')

                assertNothingStarted()
            })
        }

        it('is refused for classifier inputs the scenes cannot feed before anything the bands add', async () => {
            state.catalogue = {[CLASSIFICATION]: trainable({points: [], included: ['VV_mean', 'VH_med'], classifier: SVM})}

            await assert.rejects(exportTo({recipe: ccdcOf(), bands: ['regression_coefs']}), /ccdc-1 cannot run: UNSUPPLIED_CLASSIFIER_INPUTS$/)

            assertNothingStarted()
        })
    })
}

const inputOf = id => `users/x/${id}-input`

const trainable = ({id = CLASSIFICATION, included = ['red', 'nir'], images, points = POINTS, reuses = [], classifier = {type: 'RANDOM_FOREST'}} = {}) => {
    state.assets[inputOf(id)] = {bands: included.map(name => ({name, arrayDimensions: 0})), properties: {}}
    return {
        id,
        type: 'CLASSIFICATION',
        model: {
            inputImagery: {images: images ?? [{imageId: 'i-1', type: 'ASSET', id: inputOf(id), bandSetSpecs: [{id: 'b', type: 'IMAGE_BANDS', included}]}]},
            legend: {entries: [{value: 1}, {value: 2}]},
            classifier,
            trainingData: {dataSets: [
                ...(points.length ? [{dataSetId: 'collected', type: 'COLLECTED', referenceData: points}] : []),
                ...reuses.map(recipe => ({dataSetId: recipe, type: 'RECIPE', recipe}))
            ]}
        }
    }
}

// Over Landsat 8 scenes, fitting the breakpoint bands given; what it can be asked for is its catalogue.
const ccdcOf = (breakpointBands = ['ndvi']) => {
    state.recipeBands['ccdc-1'] = [
        'tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb',
        ...MEASURES.flatMap(measure => ['coefs', 'rmse', 'magnitude'].map(suffix => `${measure}_${suffix}`))
    ]
    return {
        id: 'ccdc-1',
        type: 'CCDC',
        title: 'My CCDC',
        model: {
            dates: {startDate: '2015-01-01', endDate: '2020-01-01'},
            sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, breakpointBands, classification: CLASSIFICATION},
            options: {corrections: ['SR']},
            ccdcOptions: {dateFormat: 1}
        }
    }
}

const assertNothingStarted = () => {
    assert.deepEqual(state.productFactories, [])
    assert.deepEqual(state.built, [])
    assert.deepEqual(state.prepared, [])
    assert.deepEqual(state.started, [])
}

const assetImage = ({bands, properties}) => ({
    bandNames: () => ({map: mapper => bands.map(({name}) => mapper(name))}),
    bandTypes: () => ({get: name => bands.find(band => band.name === name)}),
    toDictionary: keys => Object.fromEntries(keys.filter(key => key in properties).map(key => [key, properties[key]]))
})

mock.module('#sepal/ee/ee', {exports: {
    default: {
        // Readiness's own evidence of an asset, no work of the export's.
        getAsset$: id => {
            state.observed.push(id)
            return state.assets[id]
                ? of({type: 'Image'})
                : throwError(() => new Error(`Asset could not be read: ${id}`))
        },
        Image: id => assetImage(typeof id === 'string' ? state.assets[id] : {bands: [], properties: {}}),
        Dictionary: values => values,
        PixelType: band => ({dimensions: () => band.arrayDimensions}),
        Geometry: geometry => geometry,
        getInfo$: value => of(value),
        data: {ExportDestination: {DRIVE: 'DRIVE', GCS: 'GCS'}, ExportType: {IMAGE: 'IMAGE'}},
        batch: {Export: {convertToServerParams: config => config}, ExportTask: {create: config => config}},
        startImageExport$: task => {
            state.started.push(task)
            return of('T1')
        }
    }
}})
mock.module('#sepal/ee/recipe', {exports: {
    loadRecipe$: id => state.catalogue[id]
        ? of(state.catalogue[id])
        : throwError(() => new Error(`Recipe could not be read: ${id}`))
}})
// A factory given what to build with is the export's product (`productFactories`, and `built` once its image or geometry
// is asked for); one given nothing answers what the recipe can be asked for, as its description reads it.
mock.module('#sepal/ee/imageFactory', {exports: {
    default: (source, ...buildArgs) => {
        buildArgs.length && state.productFactories.push(source.id)
        const built = value => (state.built.push(source.id), value)
        return {
            getImage$: () => defer(() => of(built({builtFrom: source.id}))),
            getBands$: () => state.recipeBands[source.id]
                ? of(state.recipeBands[source.id])
                : throwError(() => new Error(`Recipe bands could not be read: ${source.id}`)),
            getGeometry$: () => defer(() => of(built({bounds: () => ({bounds: () => 'region'})})))
        }
    }
}})
mock.module('#gee/jobs/task/export/castToLargest', {exports: {
    castToLargest: image => image
}})
mock.module('#gee/jobs/task/storage/destination', {exports: {
    exportFolderName: text => text,
    prepareDestination$: ({folder}) => {
        state.prepared.push(folder)
        return of({destination: {type: 'drive', folder}, exportTarget: {type: 'drive', folder}})
    }
}})

beforeEach(() => {
    state.catalogue = {}
    state.assets = {}
    state.recipeBands = {}
    state.observed = []
    state.productFactories = []
    state.built = []
    state.prepared = []
    state.started = []
})
