import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

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

// The recipe each reference stands for: segments for Change Alerts, historical statistics for BAYTS Alerts. Their facts
// are not what this test is about; what each has to be is a producer, so resolution reaches the image rather than
// rejecting the source.
const records = {
    'segments-recipe': {id: 'segments-recipe', type: 'CCDC', model: {ccdcOptions: {dateFormat: 1}}},
    'bayts-historical-recipe': {id: 'bayts-historical-recipe', type: 'BAYTS_HISTORICAL', model: {options: {orbits: ['ASCENDING']}}}
}

const sourceOf = reference => {
    const source = {
        getImage$: () => of('source-image'),
        getBands$: () => of(['source-band']),
        getGeometry$: () => of(resolvedGeometry),
        withRecord$: derive => of(derive(records[reference.id], () => source))
    }
    return source
}

const imageFactory = mock.fn(recipe => {
    if (syntheticTypes.has(recipe.type)) {
        syntheticRecipes.push(recipe)
        return delegate
    }
    return sourceOf(recipe)
})

mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: imageFactory
    }
})

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
            monitoringDurationUnit: 'months',
            calibrationDuration: 2,
            calibrationDurationUnit: 'months'
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
    assert.equal(syntheticRecipes.length, 1)
    const syntheticRecipe = syntheticRecipes[0]
    assert.equal(syntheticRecipe.type, expectedType)
    assert.deepEqual(syntheticRecipe.model.aoi, {
        type: 'GEOMETRY',
        geometry: resolvedGeometry
    })
    assert.equal(syntheticRecipe.model.aoi.geometry, resolvedGeometry)
}

beforeEach(() => {
    imageFactory.mock.resetCalls()
    syntheticRecipes.length = 0
})

for (const [label, dataSetType, expectedType, visualizationType] of [
    ['optical monitoring', 'OPTICAL', 'MOSAIC', 'monitoring'],
    ['radar calibration', 'RADAR', 'RADAR_MOSAIC', 'calibration'],
    ['Planet monitoring', 'PLANET', 'PLANET_MOSAIC', 'monitoring']
]) {
    describe(`Change Alerts ${label} mosaic`, () => {
        it('wraps the resolved geometry in the synthetic recipe model', async () => {
            const alerts = changeAlerts(changeRecipe(dataSetType), {
                visualizationType,
                mosaicType: 'latest'
            })

            await firstValueFrom(alerts.getBands$())

            expectRuntimeGeometryAoi(expectedType)
        })
    })
}

for (const [scenario, visualizationType] of [
    ['First', 'first'],
    ['Last', 'last']
]) {
    describe(`BAYTS Alerts ${scenario} mosaic`, () => {
        it('wraps the resolved geometry in the synthetic radar recipe model', async () => {
            const alerts = baytsAlerts(baytsRecipe, {visualizationType})

            await firstValueFrom(alerts.getGeometry$())

            expectRuntimeGeometryAoi('RADAR_MOSAIC')
        })
    })
}

describe('Change Alerts Changes visualization', () => {
    it('does not construct a synthetic mosaic', async () => {
        const alerts = changeAlerts(changeRecipe('OPTICAL'), {
            visualizationType: 'changes',
            selection: ['confidence'],
            baseBands: []
        })

        await firstValueFrom(alerts.getBands$())

        assert.deepEqual(syntheticRecipes, [])
    })
})
