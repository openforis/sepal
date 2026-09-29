// What a BAYTS Historical says it holds, against the image Earth Engine builds for it from real Sentinel-1 imagery.
//
// Schema. Over an area with both passes (the Netherlands), for each pass alone, both passes and both stored the other
// way round, without spatial speckle filtering and with QUEGAN and RABASAR multitemporal filtering, its catalogue
// answers the declared bands in the order the model stores the passes, and the image built for no request, an empty
// selection or a bare selection holds exactly those, scalar. An operation naming output bands gets exactly those in
// the order named, directly and through a Masking; one naming a band that is not built is refused for that band.
// Over an area with descending imagery only (the Amazon), multitemporal filtering leaves the ascending pass without
// speckle statistics: the complete output is refused for that band, while a request needing none of them is built.
// Asking for the ascending pass alone there is refused, having no imagery.
//
// Pixels. At a point in each area, a sample must hold a number for every band it asks for. A single pass's orbit
// band holds a relative orbit of that pass, among the Sentinel-1 scenes over the point.
//
// Known defect. The single-pass mosaics a recipe of both passes composites read the recipe's own orbits
// (docs/recipes/radar-mosaic.md), so both passes' statistics come from the same imagery. That is reproduced apart, as
// a witness of the recorded defect and never as evidence that either pass is right: with a number for every band, both
// passes of a recipe of both hold exactly what a freshly built ascending-only recipe holds, and its descending pass
// differs from a freshly built descending-only recipe.
//
// Coverage limits: `orbitNumbers: 'ALL'`, `minNumberOfImages`, an area with ascending imagery only, and windows other
// than one year. Any unexpected error fails the run. Read-only: recipes are held in memory, nothing is saved and no
// asset is written. Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/baytsHistoricalOutputBands.mjs

import _ from 'lodash'
import {firstValueFrom, of, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'
import {baytsHistoricalBandNames} from '#sepal/recipe/type/baytsHistorical'

const READ_TIMEOUT_MS = 900000

const NETHERLANDS = [5.3, 52.1]
const AMAZON = [-60.05, -3.1]
const DATES = {fromDate: '2023-01-01', toDate: '2024-01-01'}

// The options a new recipe saves.
const DEFAULT_OPTIONS = {
    orbitNumbers: 'DOMINANT', geometricCorrection: 'ELLIPSOID', spatialSpeckleFilter: 'LEE', kernelSize: 9, sigma: 0.9,
    strongScatterers: 'RETAIN', strongScattererValues: [0, -5], snicSize: 5, snicCompactness: 0.15,
    multitemporalSpeckleFilter: 'NONE', numberOfImages: 10, outlierRemoval: 'MODERATE', mask: ['SIDES', 'FIRST_LAST'],
    minAngle: 30.88, maxAngle: 45.35, minObservations: 20
}

const box = ([x, y], half = 0.01) => [[x - half, y - half], [x - half, y + half], [x + half, y + half], [x + half, y - half]]

const historical = (point, options, id = 'historical-verify') => ({
    id,
    type: 'BAYTS_HISTORICAL',
    model: {aoi: {type: 'POLYGON', path: box(point)}, dates: DATES, options: {...DEFAULT_OPTIONS, ...options}}
})

const BOTH = ['ASCENDING', 'DESCENDING']

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

const sampled = (recipe, point, args) => firstValueFrom(ImageFactory(recipe, args).getImage$().pipe(
    switchMap(image => read$('pixel', image.reduceRegion({
        reducer: ee.Reducer.first(), geometry: ee.Geometry.Point(point), scale: 20
    })))
))

// The bands a sample holds no finite number for: missing, masked or not a number.
const unusableBands = (values, bands) => bands.filter(band => !Number.isFinite(values?.[band]))

const expectBuilt = async (name, recipe, args, expected) => {
    const start = Date.now()
    try {
        const bands = await built(recipe, args)
        const names = bands.map(({name}) => name)
        report(_.isEqual(names, expected) && bands.every(({arrayDimensions}) => arrayDimensions === 0), name, {
            ms: Date.now() - start, expected, built: names
        })
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
}

const expectRefused = async (name, recipe, args, cause) => {
    const start = Date.now()
    try {
        const names = (await built(recipe, args)).map(({name}) => name)
        report(false, name, {ms: Date.now() - start, expected: String(cause), built: names})
    } catch (error) {
        report(cause.test(error.message), name, {ms: Date.now() - start, expected: String(cause), error: error.message.split('\n')[0]})
    }
}

const expectCatalogue = async (name, recipe) => {
    try {
        const answered = await firstValueFrom(ImageFactory(recipe).getBands$())
        report(_.isEqual(answered, baytsHistoricalBandNames(recipe.model)), name, {answered})
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

// Every declared band, whichever way an operation asks for them without naming output bands.
const expectDeclaredOutput = async (label, recipe) => {
    const declared = baytsHistoricalBandNames(recipe.model)
    await expectCatalogue(`${label}: catalogue`, recipe)
    await expectBuilt(`${label}: asked for nothing`, recipe, undefined, declared)
    await expectBuilt(`${label}: an empty selection`, recipe, {selection: []}, declared)
    await expectBuilt(`${label}: a bare selection`, recipe, {selection: [declared[0]]}, declared)
}

// The relative orbits of one pass's scenes over a point in the recipe's window.
const relativeOrbits = (point, pass) => firstValueFrom(read$('relative orbits', ee.ImageCollection('COPERNICUS/S1_GRD')
    .filterBounds(ee.Geometry.Point(point))
    .filterDate(DATES.fromDate, DATES.toDate)
    .filter(ee.Filter.eq('orbitProperties_pass', pass))
    .aggregate_array('relativeOrbitNumber_start')
    .distinct()))

const expectPassOrbit = async (name, point, pass, suffix) => {
    try {
        const band = `orbit_${suffix}`
        const values = await sampled(historical(point, {orbits: [pass]}), point)
        const unusable = unusableBands(values, baytsHistoricalBandNames({options: {orbits: [pass]}}))
        const orbits = await relativeOrbits(point, pass)
        report(!unusable.length && orbits.includes(values[band]), name, {orbit: values[band], passOrbits: orbits, unusable})
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

const inScope = (recipes, fn) => {
    const scope = new RecipeScope(id => of(recipes[id]))
    return withRecipeScope(scope, fn).finally(() => scope.close())
}

const expectMaskedRequest = (name, recipe, requested) => inScope({[recipe.id]: recipe}, async () => {
    const masking = {
        id: 'masking-verify',
        type: 'MASKING',
        model: {imageToMask: {type: 'RECIPE_REF', id: recipe.id}, imageMask: {type: 'RECIPE_REF', id: recipe.id}}
    }
    await expectBuilt(name, masking, withOutputBands({selection: requested}), requested)
})

// The recorded defect, reproduced: a recipe of both passes against the same recipe for each pass alone.
const witnessWrongPass = async name => {
    try {
        const samples = {
            combined: await sampled(historical(NETHERLANDS, {orbits: BOTH}), NETHERLANDS),
            ascending: await sampled(historical(NETHERLANDS, {orbits: ['ASCENDING']}), NETHERLANDS),
            descending: await sampled(historical(NETHERLANDS, {orbits: ['DESCENDING']}), NETHERLANDS)
        }
        const {reproduced, unusable} = wrongPassJudgement(samples)
        console.info(`${reproduced ? 'DEFECT REPRODUCED' : 'DEFECT NOT REPRODUCED'} ${name}: ${JSON.stringify({
            combined: _.pick(samples.combined, ['VV_mean_asc', 'VV_mean_desc', 'orbit_asc', 'orbit_desc']),
            ascendingAlone: _.pick(samples.ascending, ['VV_mean_asc', 'orbit_asc']),
            descendingAlone: _.pick(samples.descending, ['VV_mean_desc', 'orbit_desc']),
            unusable
        })}`)
        if (unusable.length) {
            report(false, `${name}: samples`, {unusable})
        }
    } catch (error) {
        report(false, name, {error: error.message})
    }
}

const WITNESSED_STATISTICS = ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit']

// Reproduced only when, with a number for every band, both of the combined recipe's passes hold exactly what the
// ascending pass alone holds, and its descending pass differs from what the descending pass alone holds.
const wrongPassJudgement = ({combined, ascending, descending}) => {
    const unusable = [
        ...unusableBands(combined, baytsHistoricalBandNames({options: {orbits: BOTH}})).map(band => `combined.${band}`),
        ...unusableBands(ascending, baytsHistoricalBandNames({options: {orbits: ['ASCENDING']}})).map(band => `ascending.${band}`),
        ...unusableBands(descending, baytsHistoricalBandNames({options: {orbits: ['DESCENDING']}})).map(band => `descending.${band}`)
    ]
    const bothHoldAscending = WITNESSED_STATISTICS.every(statistic =>
        combined[`${statistic}_asc`] === ascending[`${statistic}_asc`]
        && combined[`${statistic}_desc`] === ascending[`${statistic}_asc`])
    const descendingDiffers = WITNESSED_STATISTICS.some(statistic =>
        combined[`${statistic}_desc`] !== descending[`${statistic}_desc`])
    return {reproduced: !unusable.length && bothHoldAscending && descendingDiffers, unusable}
}

const main = async () => {
    await authenticate()

    console.info('Schema')
    for (const [label, options] of [
        ['ascending', {orbits: ['ASCENDING']}],
        ['descending', {orbits: ['DESCENDING']}],
        ['both passes', {orbits: BOTH}],
        ['both passes, stored descending first', {orbits: ['DESCENDING', 'ASCENDING']}],
        ['both passes without spatial speckle filtering', {orbits: BOTH, spatialSpeckleFilter: 'NONE'}],
        ['both passes, QUEGAN', {orbits: BOTH, multitemporalSpeckleFilter: 'QUEGAN'}],
        ['both passes, RABASAR', {orbits: BOTH, multitemporalSpeckleFilter: 'RABASAR'}]
    ]) {
        await expectDeclaredOutput(label, historical(NETHERLANDS, options))
    }
    const both = historical(NETHERLANDS, {orbits: BOTH})
    await expectBuilt('output bands out of order', both, withOutputBands({selection: ['VH_std_desc', 'VV_mean_asc']}), ['VH_std_desc', 'VV_mean_asc'])
    await expectMaskedRequest('output bands out of order, through a Masking', both, ['orbit_desc', 'VV_mean_asc'])
    await expectRefused('an output band it does not build', both, withOutputBands({selection: ['VV_mean_asc', 'nope']}), /'nope' did not match/)

    const missingSpeckle = historical(AMAZON, {orbits: BOTH, multitemporalSpeckleFilter: 'QUEGAN'})
    await expectRefused('a pass without imagery under QUEGAN: its complete output', missingSpeckle, undefined, /'VV_speckle_asc' did not match/)
    await expectRefused('a pass without imagery under QUEGAN: its speckle statistics asked for', missingSpeckle,
        withOutputBands({selection: ['VV_mean_asc', 'VH_speckle_asc']}), /'VH_speckle_asc' did not match/)
    await expectBuilt('a pass without imagery under QUEGAN: a request needing none of its speckle statistics', missingSpeckle,
        withOutputBands({selection: ['VV_speckle_desc', 'VV_mean_desc']}), ['VV_speckle_desc', 'VV_mean_desc'])
    await expectRefused('the ascending pass alone, where it has no imagery', historical(AMAZON, {orbits: ['ASCENDING']}), undefined,
        /If one image has no bands/)

    console.info('Pixels')
    await expectPassOrbit('the ascending pass alone holds an ascending relative orbit', NETHERLANDS, 'ASCENDING', 'asc')
    await expectPassOrbit('the descending pass alone holds a descending relative orbit', NETHERLANDS, 'DESCENDING', 'desc')
    try {
        const values = await sampled(missingSpeckle, AMAZON, withOutputBands({selection: ['VV_speckle_desc', 'VV_mean_desc']}))
        const unusable = unusableBands(values, ['VV_speckle_desc', 'VV_mean_desc'])
        report(!unusable.length, 'a request needing none of the missing speckle statistics holds numbers', {values, unusable})
    } catch (error) {
        report(false, 'a request needing none of the missing speckle statistics holds numbers', {error: error.message})
    }

    console.info('Known defect (a witness, not evidence of correctness)')
    await witnessWrongPass('a recipe of both passes, against each pass alone')

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
