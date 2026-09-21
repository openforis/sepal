// Whether a live Masking over CCDC, asked for the physical bands of a measure it does NOT break on, returns
// exactly those bands with the mask still applied.
//
// The recipes are held in memory and read through a RecipeScope of this run's own, so nothing is saved, no
// recipe service is involved and no asset is written. Segmentation is evaluated over two points, not a
// region, which is what keeps a read-only check of a real CCDC affordable.
//
// This is the band-selection and masking half of the acceptance case. It does not establish that Earth Engine
// would ACCEPT an export of these bands - that needs a real export, and so linked-user credentials.
//
// Run with EE_CCDC_SERVICE_ACCOUNT=1, or feed linked-user credentials as one line of JSON on stdin.

import {firstValueFrom, of} from 'rxjs'

import {googleProjectId, serviceAccountCredentials} from '#gee/config'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {withOutputBands} from '#sepal/ee/outputBands'
import {RecipeScope, withRecipeScope} from '#sepal/ee/recipeScope'

const REQUESTED = ['red_coefs', 'tStart']

// Two points INSIDE the AOI, so CCDC clipping cannot be what separates them: the unmasked segments must be
// valid at both, and only the added mask may tell them apart. Global Surface Water carries `occurrence` over
// water and nothing over land, so open water is retained and the forest beside it is excluded.
const RETAINED = [-60.06, -3.14]
const EXCLUDED = [-60.02, -3.06]

const MASK = {type: 'ASSET', id: 'JRC/GSW1_4/GlobalSurfaceWater'}

const ccdcRecipe = {
    id: 'ccdc-1',
    type: 'CCDC',
    model: {
        aoi: {type: 'POLYGON', path: [[-60.10, -3.18], [-60.10, -3.04], [-60.00, -3.04], [-60.00, -3.18]]},
        dates: {startDate: '2020-01-01', endDate: '2022-01-01'},
        sources: {
            dataSets: {LANDSAT: ['LANDSAT_8']},
            cloudPercentageThreshold: 75,
            breakpointBands: ['ndvi']
        },
        options: {corrections: [], cloudDetection: ['QA'], cloudMasking: 'MODERATE'},
        ccdcOptions: {dateFormat: 1, minObservations: 4, chiSquareProbability: 0.9, minNumOfYearsScaler: 1.33, lambda: 20, maxIterations: 10000}
    }
}

const maskingRecipe = {
    id: 'masked-1',
    type: 'MASKING',
    model: {imageToMask: {type: 'RECIPE_REF', id: ccdcRecipe.id}, imageMask: MASK}
}

const callbackPromise = operation => new Promise((resolve, reject) => {
    operation((result, error) => error ? reject(error) : resolve(result))
})

const evaluate = value => callbackPromise(callback => value.evaluate((result, error) => callback(result, error)))

const attempt = async (name, run) => {
    try {
        return {probe: name, status: 'OK', value: await run()}
    } catch (error) {
        return {probe: name, status: 'FAILED', error: String(error?.message || error)}
    }
}

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
    if (process.env.EE_CCDC_SERVICE_ACCOUNT === '1') {
        await callbackPromise(callback =>
            ee.data.authenticateViaPrivateKey(serviceAccountCredentials, callback, error => callback(null, error))
        )
    } else {
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
    }
    await callbackPromise(callback => ee.initialize(null, null, callback, error => callback(null, error), null, projectId))
    ee.setMaxRetries(0)
}

const inScope = fn => {
    const catalogue = {[ccdcRecipe.id]: ccdcRecipe, [maskingRecipe.id]: maskingRecipe}
    const scope = new RecipeScope(id => of(catalogue[id]))
    return withRecipeScope(scope, fn).finally(() => scope.close())
}

const validAt = (band, [lon, lat]) => band
    .mask()
    .reduceRegion({
        reducer: ee.Reducer.first(),
        geometry: ee.Geometry.Point([lon, lat]),
        scale: 30
    })
    .values()
    .getNumber(0)

const validityOf = band => ee.Dictionary({
    retained: validAt(band, RETAINED),
    excluded: validAt(band, EXCLUDED)
})

const selected$ = recipe => firstValueFrom(
    imageFactory(recipe, withOutputBands({selection: REQUESTED})).getImage$()
)

const main = async () => {
    await authenticate()

    const probes = await inScope(async () => [
        await attempt('bands returned for the requested selection', async () =>
            await evaluate((await selected$(maskingRecipe)).bandNames())
        ),
        // Without this, an excluded point could be one CCDC never covered, and the check would pass with
        // Masking removed.
        await attempt('unmasked CCDC valid at both points', async () =>
            await evaluate(validityOf((await selected$(ccdcRecipe)).select('tStart')))
        ),
        await attempt('mask image valid at one point only', async () => {
            const mask = await firstValueFrom(imageFactory(MASK).getImage$())
            return await evaluate(validityOf(mask.select(0)))
        }),
        await attempt('masked CCDC valid at one point only', async () =>
            await evaluate(validityOf((await selected$(maskingRecipe)).select('tStart')))
        )
    ])

    console.info(JSON.stringify({requested: REQUESTED, retained: RETAINED, excluded: EXCLUDED, probes}, null, 2))
}

main().catch(error => {
    console.error(error?.stack || String(error))
    process.exit(1)
})
