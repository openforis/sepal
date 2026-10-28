import {expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => key}))

import {availableMeasures, MONITORING_TYPES, observedMeasures} from '#sepal/recipe/changeAlerts/monitoringMeasures'
import {getAvailableBands} from '~/sources'

import {dataSetOptions} from './monitoringData'

// Keep the server's native monitoring scope aligned with the existing GUI catalogue, including SR/TOA.
it.each(MONITORING_TYPES)('preserves the monitoring choices of %s', type => {
    const available = []
    dataSetOptions(type).forEach(({value}) => {
        ;[[], ['SR']].forEach(corrections => {
            const dataSets = {[type === 'OPTICAL' ? value.startsWith('SENTINEL') ? 'SENTINEL_2' : 'LANDSAT' : type === 'RADAR' ? 'SENTINEL_1' : 'PLANET']: [value]}
            const previous = getAvailableBands({dataSets: [value], corrections})
            expect([...observedMeasures({sources: {dataSets}, options: {corrections}})].sort()).toEqual([...previous].sort())
            available.push(...previous)
        })
    })
    expect([...availableMeasures(type)].sort()).toEqual([...new Set(available)].sort())
})

it('preserves the common native scope across multiple optical datasets', () => {
    const dataSets = ['LANDSAT_8', 'SENTINEL_2']
    for (const corrections of [[], ['SR']]) {
        expect(observedMeasures({sources: {dataSets: {LANDSAT: ['LANDSAT_8'], SENTINEL_2: ['SENTINEL_2']}}, options: {corrections}}).sort())
            .toEqual(getAvailableBands({dataSets, corrections}).sort())
    }
})
