// What a Stack says it holds, against the image Earth Engine builds for it.
//
// Schema. Its catalogue answers the output names its mapping gives, in model order, however it is asked, and its
// running image holds exactly those bands when asked for nothing and for an empty selection; a selection comes back in
// model order. Described through the shared resolver from its assets' own band evidence, each output band takes its
// input band's dimensionality, and a verified scalar its asset states no policy for is averaged. One asset stacked
// twice is described and built under the distinct names its mapping gives. A mapping the declaration refuses before
// reading anything is shown beside what Earth Engine does with it: two output bands named alike are built with the
// second renamed, a band the input does not hold is refused, and an input with no mapping is named when built.
//
// Pixels. One value is compared: a renamed elevation against its source at a point.
//
// Any unexpected error fails the run. Read-only: the recipes are held in memory over public assets, nothing is saved
// and no asset is written. Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/stackOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, forkJoin, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {assetBandEvidence$, typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {stackOutputNames} from '#sepal/recipe/type/stack'

const READ_TIMEOUT_MS = 900000

const DEM = {type: 'ASSET', id: 'USGS/SRTMGL1_003'}
const WATER = {type: 'ASSET', id: 'JRC/GSW1_4/GlobalSurfaceWater'}
const POINT = [-60.05, -3.1]

const stack = (images, bandNames) => ({
    id: 'stack-verify',
    type: 'STACK',
    model: {inputImagery: {images}, bandNames: {bandNames}}
})

const mapping = (imageId, pairs) => ({
    imageId,
    bands: pairs.map(([originalName, outputName], index) => ({id: `${imageId}-${index}`, originalName, outputName}))
})

const TWO_ASSETS = [{imageId: 's-1', ...DEM}, {imageId: 's-2', ...WATER}]

const CONFIGURED = stack(TWO_ASSETS, [
    mapping('s-1', [['elevation', 'dem']]),
    mapping('s-2', [['occurrence', 'water'], ['max_extent', 'extent']])
])

const REPEATED = stack([{imageId: 's-1', ...DEM}, {imageId: 's-3', ...DEM}], [
    mapping('s-1', [['elevation', 'elevation']]),
    mapping('s-3', [['elevation', 'elevation_1']])
])

const DUPLICATED = stack(TWO_ASSETS, [
    mapping('s-1', [['elevation', 'x']]),
    mapping('s-2', [['occurrence', 'x'], ['max_extent', 'extent']])
])

const MISSING_BAND = stack(TWO_ASSETS, [
    mapping('s-1', [['nope', 'dem']]),
    mapping('s-2', [['occurrence', 'water']])
])

const UNMAPPED = stack(TWO_ASSETS, [mapping('s-1', [['elevation', 'dem']])])

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

// Every asset's band evidence, as the observation lifecycle reads it.
const assetEvidence = async recipe => {
    const ids = _.uniq(recipe.model.inputImagery.images.map(({id}) => id))
    const bands = await firstValueFrom(forkJoin(ids.map(id => assetBandEvidence$(id))).pipe(timeout(READ_TIMEOUT_MS)))
    return Object.fromEntries(ids.map((id, index) => [id, bands[index]]))
}

const describedFrom = (recipe, evidence = {}) => readImageOutput({
    graph: buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map([[recipe.id, recipe]])}),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    observationFor: ({type, id}) => type === 'ASSET' && evidence[id]
        ? {
            bands: evidence[id].map(({name, arrayDimensions, encoding}) => ({
                name,
                dataType: {arrayDimensions},
                ...(encoding && {encoding})
            })),
            evidence: []
        }
        : undefined
})

const expectDescribed = async (name, recipe) => {
    const start = Date.now()
    try {
        const {status, description} = describedFrom(recipe, await assetEvidence(recipe))
        const expected = stackOutputNames(recipe.model)
            .map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean'}))
        report(status === 'READY' && _.isEqual(description.output.bands, expected), name, {
            ms: Date.now() - start, status, bands: description?.output.bands
        })
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
}

const expectDeclarationRefuses = async (name, recipe, code, {readsInputs}) => {
    try {
        const evidence = readsInputs ? await assetEvidence(recipe) : {}
        const {status, diagnostics, needs} = describedFrom(recipe, evidence)
        report(
            status === 'INVALID' && _.isEqual(diagnostics.map(({code}) => code), [code]) && !needs.observations.length,
            name,
            {status, diagnostics}
        )
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

const expectPixel = async name => {
    try {
        const values = await firstValueFrom(forkJoin({
            stacked: ImageFactory(CONFIGURED, {selection: ['dem', 'water']}).getImage$(),
            source: ImageFactory(DEM).getImage$()
        }).pipe(
            switchMap(({stacked, source}) => read$('pixel', ee.Image.cat([stacked, source.select('elevation')]).reduceRegion({
                reducer: ee.Reducer.first(), geometry: ee.Geometry.Point(POINT), scale: 30
            })))
        ))
        report(Number.isInteger(values.elevation) && values.dem === values.elevation, name, values)
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

const main = async () => {
    await authenticate()
    const configured = stackOutputNames(CONFIGURED.model)

    console.info('Schema')
    for (const [label, args] of [['nothing', undefined], ['an empty selection', {selection: []}], ['a subset', {selection: ['water']}]]) {
        await expectCatalogue(`catalogue, asked for ${label}`, CONFIGURED, args, configured)
    }
    await expectBuilt('running image, asked for nothing', CONFIGURED, undefined, configured)
    await expectBuilt('running image, empty selection', CONFIGURED, {selection: []}, configured)
    await expectBuilt('a selection, in model order', CONFIGURED, withOutputBands({selection: ['extent', 'dem']}), ['dem', 'extent'])
    await expectDescribed('described from its assets\' band evidence', CONFIGURED)

    await expectDescribed('one asset stacked twice, described', REPEATED)
    await expectBuilt('one asset stacked twice, built', REPEATED, undefined, ['elevation', 'elevation_1'])

    await expectDeclarationRefuses('two output bands named alike are refused before reading', DUPLICATED, 'DUPLICATE_BAND_NAME', {readsInputs: false})
    await expectBuilt('two output bands named alike, as Earth Engine builds them', DUPLICATED, undefined, ['x', 'x_1', 'extent'])
    await expectDeclarationRefuses('a band its input does not hold is refused', MISSING_BAND, 'MISSING_INPUT_BAND', {readsInputs: true})
    await expectRefusal('a band its input does not hold, as Earth Engine builds it', MISSING_BAND, /did not match any bands/)
    await expectDeclarationRefuses('an input with no mapping is refused before reading', UNMAPPED, 'UNMAPPED_INPUT', {readsInputs: false})
    await expectRefusal('an input with no mapping, as Earth Engine builds it', UNMAPPED, /Stack input s-2 maps no bands/)

    console.info('Pixels')
    await expectPixel('a renamed elevation against its source')

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
