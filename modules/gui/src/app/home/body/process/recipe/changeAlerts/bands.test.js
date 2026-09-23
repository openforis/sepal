import {vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {getAvailableBands} = await import('./bands')
const {getPreSetVisualizations} = await import('./visualizations')

// What the GUI adds to the shared projection: which helper describes the mosaic that projection names. Which
// model it produces for a period and mosaic type is the shared module's own concern, tested there.
describe('the bands a Change Alerts mosaic mode offers', () => {
    const alertsRecipe = (sources, corrections = []) => ({
        model: {
            sources,
            options: {corrections},
            date: {
                monitoringEnd: '2024-06-15',
                monitoringDuration: 2,
                monitoringDurationUnit: 'months',
                calibrationDuration: 3,
                calibrationDurationUnit: 'months'
            }
        }
    })

    const OPTICAL = {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}}

    const RADAR = {dataSetType: 'RADAR', dataSets: {SENTINEL_1: ['SENTINEL_1']}}

    const offeredBands = (sources, visualizationType, mosaicType, corrections) =>
        Object.keys(getAvailableBands(alertsRecipe(sources, corrections), visualizationType, mosaicType))

    // Metadata bands are offered only for a composite that is not a median, and the projection's always is.
    it('are the optical mosaic\'s, composed the way that mosaic is composed', () => {
        const bands = offeredBands(OPTICAL, 'monitoring', 'median')

        expect(bands).toContain('red')
        expect(bands).not.toContain('dayOfYear')
    })

    // Surface reflectance carries a different band list from top-of-atmosphere, so a projection that drops
    // the recipe's corrections offers bands the mosaic it describes does not have.
    it('are corrected the way the recipe states', () => {
        expect(offeredBands(OPTICAL, 'monitoring', 'median')).toContain('pan')
        expect(offeredBands(OPTICAL, 'monitoring', 'median', ['SR'])).not.toContain('pan')
    })

    // A time-scan band exists only for a mosaic that scans the period, which a median mosaic does.
    it('are the radar mosaic\'s, scanning the period rather than standing at a point in time', () => {
        expect(offeredBands(RADAR, 'monitoring', 'median')).toContain('VV_med')
    })

    // The mosaic type has to reach the projection: a scan of the period is a different schema from the one
    // point in time a latest mosaic stands at.
    it('are the point-in-time schema when the latest radar mosaic is asked for', () => {
        const bands = offeredBands(RADAR, 'monitoring', 'latest')

        expect(bands).toContain('VV')
        expect(bands).not.toContain('VV_med')
    })
})

// A recipe still being configured states no monitoring end, and another recipe consuming its output reaches
// the registered helpers with no mode at all. Execution must fail loudly on that model; a consumer asking
// what this recipe offers must not.
describe('a Change Alerts recipe that states no period yet', () => {
    const undated = {
        model: {
            sources: {dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}},
            options: {corrections: []},
            date: {
                monitoringDuration: 2,
                monitoringDurationUnit: 'months',
                calibrationDuration: 3,
                calibrationDurationUnit: 'months'
            }
        }
    }

    it('offers no bands and no presets, rather than failing', () => {
        expect(getAvailableBands(undated)).toEqual({})
        expect(getPreSetVisualizations(undated)).toEqual([])
    })
})
