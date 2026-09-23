// Whether what a recipe SAYS it provides is what it BUILDS: `getBands$()` against the band names of the image
// `getImage$()` returns, on live Earth Engine.
//
// Three questions per fixture, because they are different questions. Asked for exactly the bands it declares, a
// producer must return those bands and no others - a declared band its image does not carry fails here rather
// than at export time. Asked for a subset of them in an order it does not build in, it must return that subset
// in that order: an export names the bands it wants, and a producer that ignores the naming writes an asset
// whose bands are not the ones asked for. Asked for nothing, it builds whatever it builds, and bands beyond the
// declared list are reported rather than judged: which bands an unrequested image should carry is a product
// decision.
//
// Read-only. Recipes are held in memory and read through a RecipeScope of this run's own, so nothing is saved,
// no recipe service is involved and no asset is written. Adding a recipe family is one more FIXTURES entry.
//
// Authenticates with the service account. Set EE_BANDS_CREDENTIALS=stdin to feed linked-user credentials as
// one line of JSON on stdin instead.

import {firstValueFrom, of} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'

const AOI = {type: 'POLYGON', path: [[-60.10, -3.18], [-60.10, -3.04], [-60.00, -3.04], [-60.00, -3.18]]}

const RADAR_OPTIONS = {
    orbits: ['DESCENDING'],
    geometricCorrection: 'ELLIPSOID',
    spatialSpeckleFilter: 'NONE',
    multitemporalSpeckleFilter: 'NONE',
    outlierRemoval: 'NONE',
    orbitNumbers: 'ALL',
    minObservations: 1
}

const ccdcRecipe = {
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        aoi: AOI,
        dates: {startDate: '2020-01-01', endDate: '2022-01-01'},
        sources: {
            dataSets: {LANDSAT: ['LANDSAT_8']},
            cloudPercentageThreshold: 75,
            breakpointBands: ['ndvi']
        },
        options: {corrections: [], cloudDetection: ['QA'], cloudMasking: 'MODERATE'},
        ccdcOptions: {
            dateFormat: 1, minObservations: 4, chiSquareProbability: 0.9,
            minNumOfYearsScaler: 1.33, lambda: 20, maxIterations: 10000
        }
    }
}

const changeAlertsRecipe = {
    id: 'change-alerts-1',
    type: 'CHANGE_ALERTS',
    model: {
        reference: {type: 'RECIPE_REF', id: ccdcRecipe.id},
        sources: {
            band: 'ndvi',
            dataSetType: 'OPTICAL',
            dataSets: {LANDSAT: ['LANDSAT_8']},
            cloudPercentageThreshold: 75
        },
        options: {corrections: [], cloudDetection: ['QA'], cloudMasking: 'MODERATE'},
        date: {
            monitoringEnd: '2021-12-01',
            monitoringDuration: 1,
            monitoringDurationUnit: 'months',
            calibrationDuration: 3,
            calibrationDurationUnit: 'months'
        },
        changeAlertsOptions: {
            minConfidence: 5, minNumberOfChanges: 3, numberOfObservations: 3,
            mustBeConfirmedInMonitoring: true, mustBeStableBeforeChange: true, mustStayChanged: true
        }
    }
}

const radarMosaicRecipe = (id, dates) => ({
    id,
    type: 'RADAR_MOSAIC',
    model: {aoi: AOI, dates, options: RADAR_OPTIONS}
})

const radarTimeScan = radarMosaicRecipe('radar-time-scan', {fromDate: '2021-01-01', toDate: '2022-01-01'})
const radarPointInTime = radarMosaicRecipe('radar-point-in-time', {targetDate: '2021-03-01'})

// The historical statistics BAYTS alerts are detected against, held in memory like the CCDC reference rather
// than read from a saved asset, so the fixture needs nothing the caller had to create first.
const baytsHistoricalRecipe = {
    id: 'bayts-historical',
    type: 'BAYTS_HISTORICAL',
    model: {
        aoi: AOI,
        dates: {fromDate: '2020-01-01', toDate: '2021-01-01'},
        options: RADAR_OPTIONS
    }
}

const baytsAlertsRecipe = {
    id: 'bayts-alerts-1',
    type: 'BAYTS_ALERTS',
    model: {
        reference: {type: 'RECIPE_REF', id: baytsHistoricalRecipe.id},
        date: {
            monitoringEnd: '2021-04-01',
            monitoringDuration: 1,
            monitoringDurationUnit: 'months'
        },
        options: RADAR_OPTIONS,
        baytsAlertsOptions: {}
    }
}

const CATALOGUE = {
    [ccdcRecipe.id]: ccdcRecipe,
    [changeAlertsRecipe.id]: changeAlertsRecipe,
    [radarTimeScan.id]: radarTimeScan,
    [radarPointInTime.id]: radarPointInTime,
    [baytsHistoricalRecipe.id]: baytsHistoricalRecipe,
    [baytsAlertsRecipe.id]: baytsAlertsRecipe
}

const FIXTURES = [
    {
        name: 'Change Alerts change product',
        recipe: changeAlertsRecipe
    },
    {
        name: 'Radar Mosaic time scan',
        recipe: radarTimeScan
    },
    {
        name: 'Radar Mosaic time scan, harmonic-dependent selection',
        recipe: radarTimeScan,
        args: {selection: ['VV_phase']}
    },
    {
        // Which bands an unrequested point-in-time composite should carry is a recorded product decision, so
        // what it builds beyond the declared list is reported, not judged.
        name: 'Radar Mosaic point in time',
        recipe: radarPointInTime
    },
    {
        name: 'BAYTS Alerts alert product',
        recipe: baytsAlertsRecipe
    },
    {
        // A map mode of the same recipe is a radar mosaic around the monitoring dates, so what it declares is
        // the delegate's answer rather than the alert bands.
        name: 'BAYTS Alerts radar map mode',
        recipe: baytsAlertsRecipe,
        args: {visualizationType: 'last'}
    }
]

const callbackPromise = operation => new Promise((resolve, reject) => {
    operation((result, error) => error ? reject(error) : resolve(result))
})

const evaluate = value => callbackPromise(callback => value.evaluate((result, error) => callback(result, error)))

const readCredentialsFromStdin = async () => {
    let input = ''
    for await (const chunk of process.stdin) {
        input += chunk
        if (input.includes('\n')) {
            process.stdin.pause()
            break
        }
    }
    return JSON.parse(input.trim())
}

const authenticate = async () => {
    let projectId = googleProjectId
    if (process.env.EE_BANDS_CREDENTIALS === 'stdin') {
        if (process.stdin.isTTY) {
            throw new Error('Linked-user credential receiver must not be a TTY')
        }
        process.stderr.write('Credential receiver ready (stdinIsTTY=false)\n')
        const credentials = await readCredentialsFromStdin()
        if (!credentials.access_token || !credentials.project_id) {
            throw new Error('Linked-user authorization is incomplete')
        }
        if (Number(credentials.access_token_expiry_date) <= Date.now()) {
            throw new Error('Linked-user authorization is expired')
        }
        projectId = credentials.project_id
        ee.data.clearAuthToken()
        ee.data.setAuthTokenRefresher(null)
        ee.data.setAuthToken(null, 'Bearer', credentials.access_token, null, null, null, false)
    } else {
        await callbackPromise(callback =>
            ee.data.authenticateViaPrivateKey(serviceAccountCredentials, callback, error => callback(null, error))
        )
    }
    await callbackPromise(callback => ee.initialize(null, null, callback, error => callback(null, error), null, projectId))
    ee.setMaxRetries(0)
}

const inScope = fn => {
    const scope = new RecipeScope(id => of(CATALOGUE[id]))
    return withRecipeScope(scope, fn).finally(() => scope.close())
}

const bandNamesOf = async (recipe, args) =>
    await evaluate((await firstValueFrom(imageFactory(recipe, args).getImage$())).bandNames())

const missingFrom = (declared, built) => declared.filter(band => !built.includes(band))

// Half the declared bands, in the reverse of the order the producer builds them in: an image that happens to
// carry them in its own order is not the same as one projected to what was asked for.
const reorderedSubset = declared => declared.filter((_band, index) => index % 2 === 0).reverse()

// A fixture with no arguments passes none, rather than an empty object: a producer's own defaults are part of
// what it builds, and several apply only to an absent argument.
const check = async ({name, recipe, args}) => {
    try {
        const declared = await firstValueFrom(imageFactory(recipe, args).getBands$())
        const asDeclared = await bandNamesOf(recipe, {...args, ...withOutputBands({selection: declared})})
        const subset = reorderedSubset(declared)
        const asSubset = await bandNamesOf(recipe, {...args, ...withOutputBands({selection: subset})})
        const asAsked = await bandNamesOf(recipe, args)
        const missing = missingFrom(declared, asDeclared)
        const disagrees = missing.length
            || String(asDeclared) !== String(declared)
            || String(asSubset) !== String(subset)
        return {
            fixture: name,
            status: disagrees ? 'DISAGREES' : 'AGREES',
            declared,
            askedForWhatItDeclares: asDeclared,
            missing,
            askedForThisSubset: subset,
            gotBackForThatSubset: asSubset,
            builtForTheseArguments: asAsked,
            beyondTheDeclaredList: missingFrom(asAsked, declared)
        }
    } catch (error) {
        return {fixture: name, status: 'FAILED', error: String(error?.message || error)}
    }
}

const main = async () => {
    await authenticate()
    const results = await inScope(async () => {
        const collected = []
        for (const fixture of FIXTURES) {
            collected.push(await check(fixture))
        }
        return collected
    })
    console.info(JSON.stringify({results}, null, 2))
}

main().catch(error => {
    console.error(error?.stack || String(error))
    process.exit(1)
})
