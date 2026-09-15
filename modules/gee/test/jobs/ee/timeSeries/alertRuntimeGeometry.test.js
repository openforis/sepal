import {jest} from '@jest/globals'
import {firstValueFrom, of} from 'rxjs'

const resolvedGeometry = {
    type() {
        return 'Polygon'
    }
}
const syntheticRecipes = []
const syntheticTypes = new Set(['MOSAIC', 'RADAR_MOSAIC', 'PLANET_MOSAIC'])
const delegate = {
    getImage$: () => of('synthetic-image'),
    getBands$: () => of(['synthetic-band']),
    getVisParams$: () => of({}),
    getGeometry$: () => of(resolvedGeometry)
}

// The segments recipe the reference stands for. Its facts are not what this test is about; what it has
// to be is a producer, so resolution reaches the image rather than rejecting the source.
const segmentsRecord = {id: 'segments-recipe', type: 'CCDC', model: {ccdcOptions: {dateFormat: 1}}}

const source = {
    getImage$: () => of('source-image'),
    getBands$: () => of(['source-band']),
    getGeometry$: () => of(resolvedGeometry),
    withRecord$: derive => of(derive(segmentsRecord, () => source))
}

const imageFactory = jest.fn(recipe => {
    if (syntheticTypes.has(recipe.type)) {
        syntheticRecipes.push(recipe)
        return delegate
    }
    return source
})

jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({default: imageFactory}))

// Registers the CCDC definition the resolver asks for.
await import('#sepal/recipe/type/ccdc')
const {default: changeAlerts} = await import('#sepal/ee/timeSeries/changeAlerts')
const {default: baytsAlerts} = await import('#sepal/ee/bayts/baytsAlerts')

const changeRecipe = dataSetType => ({
    type: 'CHANGE_ALERTS',
    model: {
        reference: {type: 'RECIPE_REF', id: 'segments-recipe'},
        sources: {
            band: 'ndvi',
            dataSetType,
            dataSets: {
                LANDSAT: ['LANDSAT_8'],
                SENTINEL_1: ['SENTINEL_1'],
                PLANET: ['planet-source']
            },
            assets: ['projects/project/assets/planet-image']
        },
        options: {corrections: []},
        date: {
            monitoringEnd: '2024-01-01',
            monitoringDuration: 1,
            monitoringDurationUnit: 'year',
            calibrationDuration: 2,
            calibrationDurationUnit: 'year'
        },
        changeAlertsOptions: {}
    }
})

const baytsRecipe = {
    type: 'BAYTS_ALERTS',
    model: {
        reference: {type: 'RECIPE_REF', id: 'bayts-historical-recipe'},
        date: {
            monitoringEnd: '2024-01-01',
            monitoringDuration: 1,
            monitoringDurationUnit: 'year'
        },
        options: {orbits: ['ASCENDING']},
        baytsAlertsOptions: {}
    }
}

const expectRuntimeGeometryAoi = expectedType => {
    expect(syntheticRecipes).toHaveLength(1)
    const syntheticRecipe = syntheticRecipes[0]
    expect(syntheticRecipe.type).toBe(expectedType)
    expect(syntheticRecipe.model.aoi).toEqual({
        type: 'GEOMETRY',
        geometry: resolvedGeometry
    })
    expect(syntheticRecipe.model.aoi.geometry).toBe(resolvedGeometry)
}

beforeEach(() => {
    imageFactory.mockClear()
    syntheticRecipes.length = 0
})

describe.each([
    ['optical monitoring', 'OPTICAL', 'MOSAIC', 'monitoring'],
    ['radar calibration', 'RADAR', 'RADAR_MOSAIC', 'calibration'],
    ['Planet monitoring', 'PLANET', 'PLANET_MOSAIC', 'monitoring']
])('Change Alerts %s mosaic', (_label, dataSetType, expectedType, visualizationType) => {
    it('wraps the resolved geometry in the synthetic recipe model', async () => {
        const alerts = changeAlerts(changeRecipe(dataSetType), {
            visualizationType,
            mosaicType: 'latest'
        })

        await firstValueFrom(alerts.getBands$())

        expectRuntimeGeometryAoi(expectedType)
    })
})

describe.each([
    ['First', 'first'],
    ['Last', 'last']
])('BAYTS Alerts %s mosaic', (_label, visualizationType) => {
    it('wraps the resolved geometry in the synthetic radar recipe model', async () => {
        const alerts = baytsAlerts(baytsRecipe, {visualizationType})

        await firstValueFrom(alerts.getGeometry$())

        expectRuntimeGeometryAoi('RADAR_MOSAIC')
    })
})

describe('Change Alerts Changes visualization', () => {
    it('does not construct a synthetic mosaic', async () => {
        const alerts = changeAlerts(changeRecipe('OPTICAL'), {
            visualizationType: 'changes',
            selection: ['confidence'],
            baseBands: []
        })

        await firstValueFrom(alerts.getBands$())

        expect(syntheticRecipes).toEqual([])
    })
})
