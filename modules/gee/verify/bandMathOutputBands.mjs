// What a Band Math recipe says it holds, against the image Earth Engine builds for it.
//
// Schema. Its catalogue answers the configured output names, in configured order, however it is asked. Its running
// image holds exactly those bands when asked for nothing and for an empty selection, and a subset out of order comes
// back in the order asked. Described through the shared resolver from an observation of that running image, it is
// READY with every verified scalar averaged. Over a CCDC recipe's array bands - an expression over its coefficients
// cast to float, and its segment starts passed through - the observed output keeps both arrays, each sampled. The
// Earth Engine operations Band Math applies, checked on their own as supporting evidence, decide that
// dimensionality: a cast keeps an array an array, an expression over an array yields one, and reducers either refuse
// arrays, keep them or count them. Two output bands named alike are refused by the declaration before anything is
// observed, while Earth Engine itself would build them with the second renamed; a recipe with no output bands
// describes none, while Earth Engine refuses to build it.
//
// Pixels. One value is compared: a doubled elevation, cast to int16, at a point.
//
// Any unexpected error fails the run. Read-only: the recipes are held in memory over public assets and read through a
// RecipeScope of this run's own, nothing is saved and no asset is written; over CCDC only band types are evaluated.
// Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/bandMathOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, of, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {imageBandEvidence$, typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {bandMathOutputNames} from '#sepal/recipe/type/bandMath'

const READ_TIMEOUT_MS = 900000

const DEM = {type: 'ASSET', id: 'USGS/SRTMGL1_003'}
const WATER = {type: 'ASSET', id: 'JRC/GSW1_4/GlobalSurfaceWater'}
const POINT = [-60.05, -3.1]

// Two inputs; an expression, a reducer and an expression over a whole image; one output band passed through from an
// input and one calculation left intermediate.
const bandMath = outputImages => ({
    id: 'band-math-verify',
    type: 'BAND_MATH',
    model: {
        inputImagery: {images: [
            {imageId: 'i-1', name: 'i1', ...DEM, includedBands: [{id: 'b1', name: 'elevation'}]},
            {imageId: 'i-2', name: 'i2', ...WATER, includedBands: [{id: 'b2', name: 'occurrence'}, {id: 'b3', name: 'recurrence'}]}
        ]},
        calculations: {calculations: [
            {imageId: 'c-1', name: 'c1', type: 'EXPRESSION', expression: 'i1.elevation * 2', dataType: 'int16',
                includedBands: [{id: 'b1', name: 'doubled'}]},
            {imageId: 'c-2', name: 'c2', type: 'FUNCTION', reducer: 'mean', dataType: 'auto',
                includedBands: [{id: 'r', name: 'mean'}],
                usedBands: [{imageId: 'i-2', name: 'occurrence'}, {imageId: 'i-2', name: 'recurrence'}]},
            {imageId: 'c-3', name: 'c3', type: 'EXPRESSION', expression: 'i2 * 2', dataType: 'float',
                includedBands: [{id: 'b2', name: 'occurrence2'}, {id: 'b3', name: 'recurrence2'}]}
        ]},
        outputBands: {outputImages}
    }
})

const CONFIGURED = bandMath([
    {imageId: 'c-3', outputBands: [{id: 'b3', name: 'recurrence2', defaultOutputName: 'recurrence2'}]},
    {imageId: 'c-1', outputBands: [{id: 'b1', name: 'doubled', defaultOutputName: 'doubled', outputName: 'dem2'}]},
    {imageId: 'i-1', outputBands: [{id: 'b1', name: 'elevation', defaultOutputName: 'elevation'}]},
    {imageId: 'c-2', outputBands: [{id: 'r', name: 'mean', defaultOutputName: 'mean'}]}
])

const DUPLICATED = bandMath([
    {imageId: 'i-1', outputBands: [{id: 'b1', name: 'elevation', defaultOutputName: 'elevation', outputName: 'x'}]},
    {imageId: 'c-1', outputBands: [{id: 'b1', name: 'doubled', defaultOutputName: 'x'}]}
])

const EMPTY = bandMath([])

// Segments over a small area and two years, whose coefficients are one array per segment of one value per term.
const CCDC = {
    id: 'ccdc-verify',
    type: 'CCDC',
    model: {
        aoi: {type: 'POLYGON', path: [[-60.10, -3.18], [-60.10, -3.04], [-60.00, -3.04], [-60.00, -3.18]]},
        dates: {startDate: '2020-01-01', endDate: '2022-01-01'},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 75, breakpointBands: ['ndvi']},
        options: {corrections: [], cloudDetection: ['QA'], cloudMasking: 'MODERATE'},
        ccdcOptions: {dateFormat: 1, minObservations: 4, chiSquareProbability: 0.9, minNumOfYearsScaler: 1.33, lambda: 20, maxIterations: 10000}
    }
}

const OVER_ARRAYS = {
    id: 'band-math-arrays-verify',
    type: 'BAND_MATH',
    model: {
        inputImagery: {images: [
            {imageId: 'i-3', name: 'i3', type: 'RECIPE_REF', id: CCDC.id,
                includedBands: [{id: 's1', name: 'ndvi_coefs'}, {id: 's2', name: 'tStart'}]}
        ]},
        calculations: {calculations: [
            {imageId: 'c-4', name: 'c4', type: 'EXPRESSION', expression: 'i3.ndvi_coefs * 2', dataType: 'float',
                includedBands: [{id: 's1', name: 'ndvi_coefs'}]}
        ]},
        outputBands: {outputImages: [
            {imageId: 'c-4', outputBands: [{id: 's1', name: 'ndvi_coefs', defaultOutputName: 'coefs2'}]},
            {imageId: 'i-3', outputBands: [{id: 's2', name: 'tStart', defaultOutputName: 'tStart'}]}
        ]}
    }
}

const inScope = fn => {
    const scope = new RecipeScope(id => of({[CCDC.id]: CCDC}[id]))
    return withRecipeScope(scope, fn).finally(() => scope.close())
}

const callbackPromise = fn =>
    new Promise((resolve, reject) => fn((result, error) => error ? reject(new Error(error)) : resolve(result)))

const authenticate = async () => {
    await callbackPromise(callback =>
        ee.data.authenticateViaPrivateKey(serviceAccountCredentials, () => callback(true), error => callback(null, error))
    )
    await callbackPromise(callback =>
        ee.initialize(null, null, () => callback(true), error => callback(null, error), null, googleProjectId)
    )
    ee.setMaxRetries(0)
}

let failures = 0

const report = (passed, name, details) => {
    failures += passed ? 0 : 1
    console.info(`${passed ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(details)}`)
}

const read$ = (description, value) => ee.getInfo$(value, description).pipe(timeout(READ_TIMEOUT_MS))

const built = (recipe, args) => firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
    switchMap(image => read$('built bands', typedBands(image)))
))

const expectCatalogue = async (name, recipe, args, expected) => {
    try {
        const answered = await firstValueFrom(ImageFactory(recipe, args).getBands$())
        report(_.isEqual(answered, expected), name, {answered})
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

const expectBuilt = async (name, recipe, args, expected) => {
    const start = Date.now()
    try {
        const names = (await built(recipe, args)).map(({name}) => name)
        report(_.isEqual(names, expected), name, {ms: Date.now() - start, expected, built: names})
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
}

const expectRefusal = async (name, recipe, reason) => {
    try {
        const names = (await built(recipe)).map(({name}) => name)
        report(false, name, {expected: String(reason), built: names})
    } catch (error) {
        report(reason.test(error.message), name, {expected: String(reason), error: error.message})
    }
}

// The description the shared resolver gives from what observing the running image establishes.
const describedFrom = (recipe, observed, records = []) => readImageOutput({
    graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([recipe, ...records].map(record => [record.id, record]))}),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    observationFor: ({type, id}) => type === 'RECIPE_REF' && id === recipe.id && observed
        ? {bands: observed.map(({name, arrayDimensions}) => ({name, dataType: {arrayDimensions}}))}
        : undefined
})

const expectDescribed = async name => {
    const start = Date.now()
    try {
        const observed = await firstValueFrom(imageBandEvidence$(CONFIGURED).pipe(timeout(READ_TIMEOUT_MS)))
        const {status, description} = describedFrom(CONFIGURED, observed)
        const expected = bandMathOutputNames(CONFIGURED.model)
            .map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}))
        report(status === 'READY' && _.isEqual(description.output.bands, expected), name, {
            ms: Date.now() - start, status, bands: description?.output.bands
        })
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
}

const expectDescribedArrays = name => inScope(async () => {
    const start = Date.now()
    try {
        const observed = await firstValueFrom(imageBandEvidence$(OVER_ARRAYS).pipe(timeout(READ_TIMEOUT_MS)))
        const {status, description} = describedFrom(OVER_ARRAYS, observed, [CCDC])
        const expected = [
            {name: 'coefs2', dataType: {arrayDimensions: 2}, pyramidingPolicy: 'sample'},
            {name: 'tStart', dataType: {arrayDimensions: 1}, pyramidingPolicy: 'sample'}
        ]
        report(status === 'READY' && _.isEqual(description.output.bands, expected), name, {
            ms: Date.now() - start, observed, bands: description?.output.bands
        })
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
})

const expectDimensions = async (name, image, expected) => {
    try {
        const bands = await firstValueFrom(read$('dimensions', typedBands(image)))
        report(_.isEqual(bands.map(({arrayDimensions}) => arrayDimensions), expected), name, {bands})
    } catch (error) {
        report(expected === null && /must be a numeric scalar/.test(error.message), name, {expected, error: error.message})
    }
}

const expectPixel = async name => {
    try {
        const values = await firstValueFrom(ImageFactory(CONFIGURED, {selection: ['dem2', 'elevation']}).getImage$().pipe(
            switchMap(image => read$('pixel', image.reduceRegion({
                reducer: ee.Reducer.first(), geometry: ee.Geometry.Point(POINT), scale: 30
            })))
        ))
        report(Number.isInteger(values.elevation) && values.dem2 === values.elevation * 2, name, values)
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

const main = async () => {
    await authenticate()
    const configured = bandMathOutputNames(CONFIGURED.model)

    console.info('Schema')
    for (const [label, args] of [['nothing', undefined], ['an empty selection', {selection: []}], ['a subset', {selection: ['mean']}]]) {
        await expectCatalogue(`catalogue, asked for ${label}`, CONFIGURED, args, configured)
    }
    await expectBuilt('running image, asked for nothing', CONFIGURED, undefined, configured)
    await expectBuilt('running image, empty selection', CONFIGURED, {selection: []}, configured)
    await expectBuilt('subset out of order', CONFIGURED, withOutputBands({selection: ['mean', 'dem2']}), ['mean', 'dem2'])
    await expectDescribed('described from its observed running image')
    await expectDescribedArrays('over CCDC arrays: a cast expression and a passed-through band stay arrays, sampled')

    const array = ee.Image([1, 2, 3]).toArray().rename('a')
    const scalar = ee.Image(5).rename('s')
    const arrays = ee.Image.cat([array, array.rename('b')])
    await expectDimensions('a cast keeps an array an array', array.cast({a: 'int16'}), [1])
    await expectDimensions('an expression over an array yields one', ee.Image().expression('i1.a * i2.s', {i1: array, i2: scalar}), [1])
    await expectDimensions('a mean over arrays is refused', arrays.reduce(ee.Reducer.mean()), null)
    await expectDimensions('a maximum over arrays keeps them', arrays.reduce(ee.Reducer.max()), [1])
    await expectDimensions('a count over arrays is scalar', arrays.reduce(ee.Reducer.count()), [0])

    const duplicated = describedFrom(DUPLICATED)
    report(duplicated.status === 'INVALID' && _.isEqual(duplicated.diagnostics.map(({code}) => code), ['DUPLICATE_BAND_NAME'])
        && !duplicated.needs.observations.length, 'two output bands named alike are refused before observing', duplicated.diagnostics)
    await expectBuilt('two output bands named alike, as Earth Engine builds them', DUPLICATED, undefined, ['x', 'x_1'])

    const empty = describedFrom(EMPTY)
    report(empty.status === 'READY' && !empty.description.output.bands.length, 'no output bands describes none', {status: empty.status})
    await expectRefusal('no output bands, as Earth Engine builds them', EMPTY, /did not match any bands/)

    console.info('Pixels')
    await expectPixel('a doubled elevation cast to int16')

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
