import {vi} from 'vitest'

import {assetProcessing} from '#sepal/recipe/changeAlerts/processing'

vi.mock('~/translate', () => ({msg: id => id}))

const {visualizationOptions} = await import('./visualizations')
const {sourceKeyOf} = await import('../sourceEvidence')

// A monitoring mosaic is built with the reference's processing (processingSettings.js), so its options follow the
// reference's observed metadata and are not offered before that is read.

it('provides visualization options for optical monitoring mosaics', () => {
    const recipe = alertsObserving(observedAsset({surfaceReflectance: false}))

    expect(monitoringMosaicBands(recipe)).toContain('ndvi')
})

it('provides none while the reference\'s processing is still being read', () => {
    const recipe = alertsObserving(undefined)

    expect(monitoringMosaicBands(recipe)).toEqual([])
})

const REFERENCE = {type: 'ASSET', id: 'users/x/segments'}

// The reference asset as the observation publishes it: its properties' processing, derived as production derives it.
const observedAsset = properties => ({
    status: 'OBSERVED',
    sourceKey: sourceKeyOf(REFERENCE),
    processing: assetProcessing(properties)
})

const alertsObserving = sourceEvidence => ({
    id: 'change-alerts-1',
    type: 'CHANGE_ALERTS',
    model: {
        reference: REFERENCE,
        sources: {
            dataSetType: 'OPTICAL',
            dataSets: {SENTINEL_2: ['SENTINEL_2']}
        },
        options: {corrections: []},
        date: {
            monitoringEnd: '2024-06-15',
            monitoringDuration: 2,
            monitoringDurationUnit: 'months',
            calibrationDuration: 3,
            calibrationDurationUnit: 'months'
        }
    },
    ...(sourceEvidence && {ui: {sourceEvidence}})
})

const monitoringMosaicBands = recipe => visualizationOptions(recipe, 'monitoring', 'latest')
    .flatMap(({options}) => options)
    .map(({value}) => value)
