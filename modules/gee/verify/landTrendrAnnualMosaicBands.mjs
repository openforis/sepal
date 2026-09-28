// What LandTrendr's annual mosaic product says it holds, against the image Earth Engine builds for it.
//
// The product is described through the shared resolver, by Optical Mosaic's declaration of the mosaic built for the
// year. That description names the bands a layer may ask for: the image built when every one of them is asked for
// must hold exactly those, in order and scalar - for a year in the fitted range, for no year (the last fitted year),
// and for a year outside it that the imagery covers. What the mosaic builds when asked for nothing is not that set, and
// no layer asks for it: Optical Mosaic computes indexes only on request, and keeps its qa and date bands, which the
// description does not offer. That difference is checked to be exactly this. Omitting the year must build the same
// image as asking for the last fitted one. Whether imagery exists for a year is not the description's to say. Schema
// only: no pixel value is checked.
//
// Read-only: the recipe is held in memory, nothing is saved and no asset is written. Authenticates with the service
// account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/landTrendrAnnualMosaicBands.mjs

import _ from 'lodash'
import {firstValueFrom, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'
import {REQUIRED_BANDS_BY_INDEX} from '#sepal/recipe/optical/opticalBands'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

const READ_TIMEOUT_MS = 300000

// What a composite keeps unasked that an optical mosaic's description does not offer.
const UNOFFERED_COMPOSITE_BANDS = ['qa', 'unixTimeDays', 'dayOfYear', 'daysFromTarget', 'targetDayCloseness']

const LANDTRENDR = {
    id: 'landtrendr-verify',
    type: 'LANDTRENDR',
    model: {
        aoi: {type: 'POLYGON', path: [[-60.10, -3.18], [-60.10, -3.14], [-60.06, -3.14], [-60.06, -3.18]]},
        dates: {startYear: 2014, endYear: 2021},
        sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'nbr'},
        // The options a new LandTrendr recipe saves: Optical Mosaic's defaults, with surface reflectance. They ask for a
        // medoid; the annual mosaic is a median whatever they ask.
        options: {
            corrections: ['SR'],
            brdfMultiplier: 4,
            filters: [],
            orbitOverlap: 'KEEP',
            tileOverlap: 'QUICK_REMOVE',
            includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
            sentinel2CloudProbabilityMaxCloudProbability: 65,
            sentinel2CloudScorePlusBand: 'cs_cdf',
            sentinel2CloudScorePlusMaxCloudProbability: 45,
            landsatCFMaskCloudMasking: 'MODERATE',
            landsatCFMaskCloudShadowMasking: 'MODERATE',
            landsatCFMaskCirrusMasking: 'MODERATE',
            landsatCFMaskDilatedCloud: 'REMOVE',
            sepalCloudScoreMaxCloudProbability: 30,
            cloudBuffering: 0,
            cloudBuffer: 0,
            holes: 'ALLOW',
            snowMasking: 'ON',
            compose: 'MEDOID'
        },
        landTrendrOptions: {}
    }
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

// The product as a layer's read describes it, for the year the layer names.
const described = year => {
    const {status, description, diagnostics} = readImageOutput({
        graph: buildRecipeDependencyGraph({rootRecipe: LANDTRENDR, recipesById: new Map([[LANDTRENDR.id, LANDTRENDR]])}),
        declarationFor: ({type}) => recipeType(type)?.imageOutput,
        product: {name: 'ANNUAL_MOSAIC', parameters: {year}},
        productFor: ({type}, name) => recipeType(type)?.mapProducts?.[name]
    })
    if (status !== 'READY') {
        throw new Error(`The annual mosaic of ${year} is not described: ${JSON.stringify(diagnostics)}`)
    }
    return description
}

// The arguments a layer's preview and editor send: its mode, its year and the bands selected.
const annualMosaic = (year, selection) =>
    ImageFactory(LANDTRENDR, {visualizationType: 'mosaics', year, selection})

const builtBands$ = (year, selection) => annualMosaic(year, selection).getImage$().pipe(
    switchMap(image => ee.getInfo$(typedBands(image), 'built bands')),
    timeout(READ_TIMEOUT_MS)
)

const checked = async (name, check) => {
    const start = Date.now()
    try {
        const {passed, ...details} = await check()
        report(passed, name, {ms: Date.now() - start, ...details})
    } catch (error) {
        report(false, name, {ms: Date.now() - start, error: error.message})
    }
}

const everyDeclaredBand = (name, year) => checked(name, async () => {
    const description = described(year)
    const expected = description.output.bands.map(({name, dataType}) => ({name, arrayDimensions: dataType.arrayDimensions}))
    const built = await firstValueFrom(builtBands$(year, expected.map(({name}) => name)))
    return {passed: _.isEqual(built, expected), year: description.output.product.parameters.year, expected: expected.map(({name}) => name), built}
})

const sameBands = (names, expected) =>
    _.isEqual([...names].sort(), [...expected].sort())

const main = async () => {
    await authenticate()
    const {endYear} = LANDTRENDR.model.dates

    await everyDeclaredBand('Annual mosaic of a fitted year, asked for every declared band', 2018)
    await everyDeclaredBand('Annual mosaic of no year, asked for every declared band', undefined)
    await everyDeclaredBand('Annual mosaic of a year after the fitted range, asked for every declared band', 2023)

    // Exact for this fixture: every declared index is missing and nothing else, and exactly the five composite bands
    // are extra.
    await checked('Annual mosaic asked for nothing lacks exactly the declared indexes, and holds exactly qa and the date bands besides', async () => {
        const declared = described(2018).output.bands.map(({name}) => name)
        const built = (await firstValueFrom(builtBands$(2018, []))).map(({name}) => name)
        const notBuilt = _.difference(declared, built)
        const unoffered = _.difference(built, declared)
        const declaredIndexes = declared.filter(name => Object.hasOwn(REQUIRED_BANDS_BY_INDEX, name))
        return {
            passed: sameBands(notBuilt, declaredIndexes) && sameBands(unoffered, UNOFFERED_COMPOSITE_BANDS),
            notBuilt,
            unoffered
        }
    })

    await checked('Annual mosaic of no year is the one of the last fitted year, and not another', async () => {
        const image = async year => ee.Serializer.toJSON(await firstValueFrom(annualMosaic(year, ['nir']).getImage$()))
        const [omitted, last, other] = await Promise.all([image(undefined), image(endYear), image(2018)])
        return {passed: omitted === last && omitted !== other}
    })

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
