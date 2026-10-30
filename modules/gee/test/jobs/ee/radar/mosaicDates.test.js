import assert from 'node:assert/strict'
import {beforeEach, describe, it, mock} from 'node:test'

import {firstValueFrom, of} from 'rxjs'

import {mosaicRecipe} from '#sepal/recipe/changeAlerts/mosaicRecipe'

const image = {select: () => image, clip: () => image, set: () => image}
const collection = {get: () => null, limit: () => ({size: () => 1})}
const createCollection = mock.fn(() => collection)

mock.module('#sepal/ee/ee', {exports: {default: {}}})
mock.module('#sepal/ee/aoi', {exports: {
    toGeometry$: aoi => of(aoi.geometry),
    geometryAoi: geometry => ({type: 'GEOMETRY', geometry})
}})
mock.module('#sepal/ee/radar/collection', {exports: {
    createCollection,
    hasImagery: () => assert.fail('Historical imagery is not needed for a contextual radar observation')
}})
mock.module('#sepal/ee/radar/composite', {exports: {
    toDateComposite: () => image,
    toTimeScan: () => image
}})
mock.module('#sepal/ee/validate', {exports: {validateEEImage: ({image}) => image}})

const {default: imageFactory} = await import('#sepal/ee/imageFactory')

beforeEach(() => createCollection.mock.resetCalls())

describe('the interval a Radar Mosaic passes to collection construction', () => {
    for (const [scenario, dates, options, expected] of [
        ['NONE around a target date', {targetDate: '2024-01-01'}, {outlierRemoval: 'NONE'},
            {startDate: '2023-12-02', endDate: '2024-01-31', targetDate: '2024-01-01'}],
        ['omitted outlier removal defaults to NONE', {targetDate: '2024-01-01'}, {},
            {startDate: '2023-12-02', endDate: '2024-01-31', targetDate: '2024-01-01'}],
        ...['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'].map(outlierRemoval => [
            `${outlierRemoval} retains the wider window`, {targetDate: '2024-01-01'}, {outlierRemoval},
            {startDate: '2023-07-02', endDate: '2024-07-02', targetDate: '2024-01-01'}
        ]),
        ['both explicit bounds override the target window',
            {targetDate: '2024-01-01', fromDate: '2023-10-01', toDate: '2024-04-01'}, {outlierRemoval: 'NONE'},
            {startDate: '2023-10-01', endDate: '2024-04-01', targetDate: '2024-01-01'}],
        ['an explicit lower bound leaves only the upper bound derived',
            {targetDate: '2024-01-01', fromDate: '2023-10-01'}, {outlierRemoval: 'NONE'},
            {startDate: '2023-10-01', endDate: '2024-01-31', targetDate: '2024-01-01'}],
        ['an explicit upper bound leaves only the lower bound derived',
            {targetDate: '2024-01-01', toDate: '2024-04-01'}, {outlierRemoval: 'NONE'},
            {startDate: '2023-12-02', endDate: '2024-04-01', targetDate: '2024-01-01'}],
        ['a time scan uses its period without a target window',
            {fromDate: '2023-01-01', toDate: '2024-01-01'}, {outlierRemoval: 'NONE'},
            {startDate: '2023-01-01', endDate: '2024-01-01', targetDate: undefined}]
    ]) {
        it(scenario, async () => {
            const recipe = radarRecipe(dates, options)

            await firstValueFrom(imageFactory(recipe, {selection: dates.targetDate ? ['VV'] : ['VV_mean']}).getImage$())

            assert.deepEqual(collectionDates(), [expected])
        })
    }
})

it('BAYTS first radar observation uses the shared NONE window despite a saved aggressive setting', async () => {
    const recipe = {
        type: 'BAYTS_ALERTS',
        model: {
            reference: {type: 'BAYTS_HISTORICAL', model: {aoi: aoi(), options: {orbits: ['ASCENDING']}}},
            date: {monitoringEnd: '2024-02-01', monitoringDuration: 1, monitoringDurationUnit: 'months'},
            options: {outlierRemoval: 'AGGRESSIVE'}
        }
    }

    await firstValueFrom(imageFactory(recipe, {visualizationType: 'first', selection: ['VV']}).getImage$())

    assert.deepEqual(collectionDates(), [{startDate: '2023-12-02', endDate: '2024-01-31', targetDate: '2024-01-01'}])
    assert.equal(createCollection.mock.calls[0].arguments[0].outlierRemoval, 'NONE')
})

it('Change Alerts latest radar mosaic uses the shared window around the monitoring end', async () => {
    const recipe = mosaicRecipe({
        model: {
            sources: {dataSetType: 'RADAR'},
            options: {outlierRemoval: 'NONE'},
            date: {
                monitoringEnd: '2024-01-01', monitoringDuration: 1, monitoringDurationUnit: 'months',
                calibrationDuration: 1, calibrationDurationUnit: 'months'
            }
        },
        period: 'monitoring', mosaicType: 'latest', aoi: aoi()
    })

    await firstValueFrom(imageFactory(recipe, {selection: ['VV']}).getImage$())

    assert.deepEqual(collectionDates(), [{startDate: '2023-12-02', endDate: '2024-01-31', targetDate: '2024-01-01'}])
})

const aoi = () => ({type: 'GEOMETRY', geometry: {type: 'Point', coordinates: [0, 0]}})

const radarRecipe = (dates, options) => ({type: 'RADAR_MOSAIC', model: {aoi: aoi(), dates, options}})

const collectionDates = () => createCollection.mock.calls.map(({arguments: [args]}) => ({
    startDate: args.startDate, endDate: args.endDate, targetDate: args.targetDate
}))
