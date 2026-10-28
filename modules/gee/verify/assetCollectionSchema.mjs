// What an Asset recipe over a collection says it holds, against what execution builds, on live Earth Engine.
//
// A recipe's bands are read from one contributing image - its collection filtered as execution filters it - with
// its masking, selection and composite applied, and without its clip. Checked here:
//
// - that this reproduces the full composite's band names and array dimensionality, for every composite, over a
//   scalar collection and an array-bearing one. Earth Engine refuses median, mean, mode and standard deviation
//   over array bands; for those, both reads must fail with that refusal;
// - that a recipe filtered within a heterogeneous collection is described by the images it composites, not by
//   the collection's first image;
// - that a recipe bounded by its collection is described without computing the collection's geometry, which for
//   a global collection exceeds Earth Engine's memory - while execution still clips to it;
// - that a recipe whose filters leave no image fails with a stated reason;
// - that a raw collection is described by its first image.
//
// Reports each read's elapsed time. Read-only: recipes are held in memory, nothing is saved and no asset is written.
// Authenticates with the service account:
//
//   docker exec -w /usr/local/src/sepal/modules/gee gee node verify/assetCollectionSchema.mjs

import _ from 'lodash'
import {firstValueFrom, switchMap, timeout} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import {assetBandEvidence$, imageBandEvidence$, typedBands} from '#sepal/ee/bandEvidence'
import ee from '#sepal/ee/ee'
import ImageFactory from '#sepal/ee/imageFactory'

const DYNAMIC_WORLD = 'GOOGLE/DYNAMICWORLD/V1'
const GLOBAL_CCDC = 'GOOGLE/GLOBAL_CCDC/V1'
const SENTINEL_1 = 'COPERNICUS/S1_GRD'

const MANAUS = {type: 'POLYGON', path: [[-60.10, -3.18], [-60.10, -3.04], [-60.00, -3.04], [-60.00, -3.18]]}
const TWO_WEEKS = {type: 'DATE_RANGE', fromDate: '2023-06-01', toDate: '2023-06-15'}
const ALL_DATES = {type: 'ALL_DATES'}
const COMPOSITES = ['MOSAIC', 'MEDIAN', 'MEAN', 'MIN', 'MAX', 'MODE', 'SD']
const ARRAY_REFUSED_COMPOSITES = ['MEDIAN', 'MEAN', 'MODE', 'SD']
const ARRAY_REFUSAL = /Input to Reducer\.\w+ must be a numeric scalar, not Type<\w+<dimensions=\d+>>/
const READ_TIMEOUT_MS = 180000

const assetRecipe = ({assetId, aoi = MANAUS, dates = TWO_WEEKS, composite = 'MOSAIC'}) => ({
    id: 'asset-recipe-1',
    type: 'ASSET_MOSAIC',
    model: {
        assetDetails: {assetId, type: 'ImageCollection'},
        aoi,
        dates,
        composite: {type: composite}
    }
})

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

// A read's answer or its failure, with how long it took.
const read = async observable$ => {
    const start = Date.now()
    try {
        return {bands: await firstValueFrom(observable$.pipe(timeout(READ_TIMEOUT_MS))), ms: Date.now() - start}
    } catch (error) {
        return {error: error.message, ms: Date.now() - start}
    }
}

const schemaOf = recipe => read(imageBandEvidence$(recipe))

// Execution's own image, clipped to its AOI, read as a whole.
const fullCompositeOf = recipe => read(
    ImageFactory(recipe).getImage$().pipe(
        switchMap(image => ee.getInfo$(typedBands(image), 'full composite bands'))
    )
)

const summary = bands => bands?.map(({name, arrayDimensions}) => `${name}:${arrayDimensions}`)

let failures = 0

const report = (outcome, name, details) => {
    failures += outcome === 'FAIL' ? 1 : 0
    console.info(`${outcome} ${name}: ${JSON.stringify(details)}`)
}

const bothReads = async recipe => {
    const [schema, full] = [await schemaOf(recipe), await fullCompositeOf(recipe)]
    const details = {schemaMs: schema.ms, fullMs: full.ms, schema: summary(schema.bands) || schema.error, full: summary(full.bands) || full.error}
    return {schema, full, details}
}

const expectSameSchema = async (name, recipe) => {
    const {schema, full, details} = await bothReads(recipe)
    report(!schema.error && !full.error && _.isEqual(schema.bands, full.bands) ? 'PASS' : 'FAIL', name, details)
    return schema
}

const expectBothRefused = async (name, recipe, refusal) => {
    const {schema, full, details} = await bothReads(recipe)
    report(refusal.test(schema.error || '') && refusal.test(full.error || '') ? 'PASS' : 'FAIL', name, details)
}

const main = async () => {
    await authenticate()

    const raw = await read(assetBandEvidence$(DYNAMIC_WORLD))
    report(raw.bands?.length ? 'PASS' : 'FAIL', 'raw Dynamic World, from its first image', {ms: raw.ms, bands: summary(raw.bands) || raw.error})

    let explicitAoi
    for (const composite of COMPOSITES) {
        const schema = await expectSameSchema(
            `Dynamic World, small AOI, two weeks, ${composite}`,
            assetRecipe({assetId: DYNAMIC_WORLD, composite})
        )
        explicitAoi = explicitAoi || schema
    }

    for (const [dates, label] of [[TWO_WEEKS, 'two weeks'], [ALL_DATES, 'all dates']]) {
        const bounded = await schemaOf(assetRecipe({assetId: DYNAMIC_WORLD, aoi: {type: 'ASSET_BOUNDS'}, dates}))
        report(
            !bounded.error && _.isEqual(bounded.bands, explicitAoi.bands) ? 'PASS' : 'FAIL',
            `Dynamic World, ASSET_BOUNDS, ${label}, described without its collection's geometry`,
            {ms: bounded.ms, bands: summary(bounded.bands) || bounded.error}
        )
    }

    const empty = await schemaOf(assetRecipe({
        assetId: DYNAMIC_WORLD,
        dates: {type: 'DATE_RANGE', fromDate: '1990-01-01', toDate: '1990-02-01'}
    }))
    report(
        /All images have been filtered out/.test(empty.error || '') ? 'PASS' : 'FAIL',
        'Dynamic World, no image in its dates, fails stating why',
        {ms: empty.ms, error: empty.error, bands: summary(empty.bands)}
    )

    for (const composite of COMPOSITES) {
        const name = `Global CCDC (array bands), small AOI, ${composite}`
        const recipe = assetRecipe({assetId: GLOBAL_CCDC, dates: ALL_DATES, composite})
        if (ARRAY_REFUSED_COMPOSITES.includes(composite)) {
            await expectBothRefused(`${name}, refused by both reads`, recipe, ARRAY_REFUSAL)
        } else {
            await expectSameSchema(name, recipe)
        }
    }

    const sentinel1Raw = await read(assetBandEvidence$(SENTINEL_1))
    const sentinel1 = await expectSameSchema(
        'Sentinel-1, small AOI, two weeks, MOSAIC',
        assetRecipe({assetId: SENTINEL_1})
    )
    report(
        sentinel1.bands && sentinel1Raw.bands && !_.isEqual(sentinel1.bands, sentinel1Raw.bands) ? 'PASS' : 'FAIL',
        'Sentinel-1, filtered, is described by the images it composites, not the collection\'s first image',
        {rawMs: sentinel1Raw.ms, raw: summary(sentinel1Raw.bands) || sentinel1Raw.error, filtered: summary(sentinel1.bands)}
    )

    if (failures) {
        throw new Error(`${failures} check(s) failed`)
    }
}

main().then(() => process.exit(0)).catch(error => {
    console.error(error)
    process.exit(1)
})
