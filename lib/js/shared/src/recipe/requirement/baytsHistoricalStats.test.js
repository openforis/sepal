import {
    ASSET,
    COMPUTED,
    INCOMPATIBLE_HISTORICAL_STATISTICS,
    INSUFFICIENT_HISTORICAL_EVIDENCE,
    MALFORMED_MONITORED_PASSES,
    MONITORABLE_STATISTICS,
    MONITORED_PASS_ABSENT,
    MONITORED_PASSES,
    NO_HISTORICAL_PASS
} from './baytsHistoricalStats.js'
import {NEEDS_EVIDENCE, SUPPORTED} from './verdict.js'

describe('historical statistics BAYTS alerts monitor against', () => {
    it('are an asset with every statistic of each pass it holds', () => {
        expect(MONITORABLE_STATISTICS.evaluate(asset([...pass('asc'), ...pass('desc')])))
            .toEqual({status: SUPPORTED, passes: ['ASCENDING', 'DESCENDING']})
    })

    it('are an asset with one pass, which is what can be monitored', () => {
        expect(MONITORABLE_STATISTICS.evaluate(asset(pass('desc')))).toEqual({status: SUPPORTED, passes: ['DESCENDING']})
    })

    it('are a complete pass beside an incomplete one, which is the pass that can be monitored', () => {
        expect(MONITORABLE_STATISTICS.evaluate(asset([...pass('asc'), ...without(pass('desc'), 'VH_speckle_desc')])))
            .toEqual({status: SUPPORTED, passes: ['ASCENDING']})
    })

    it('are not a pass missing a statistic', () => {
        expect(MONITORABLE_STATISTICS.evaluate(asset(without(pass('desc'), 'VH_speckle_desc'))).diagnostic)
            .toMatchObject({code: INCOMPATIBLE_HISTORICAL_STATISTICS, assetId: ASSET_ID, missing: ['VH_speckle_desc']})
    })

    it('are not statistics stored as arrays', () => {
        const bands = [...without(pass('asc'), 'VV_mean_asc'), band('VV_mean_asc', 1)]

        expect(MONITORABLE_STATISTICS.evaluate(asset(bands)).diagnostic).toMatchObject({
            code: INCOMPATIBLE_HISTORICAL_STATISTICS, wrongDimensions: [{band: 'VV_mean_asc', expected: 0, actual: 1}]
        })
    })

    it('are not statistics stored VH before VV, which would be read as each other', () => {
        const bands = [
            band('VH_mean_asc', 0), band('VV_mean_asc', 0),
            ...without(pass('asc'), 'VV_mean_asc', 'VH_mean_asc')
        ]

        expect(MONITORABLE_STATISTICS.evaluate(asset(bands)).diagnostic)
            .toMatchObject({code: INCOMPATIBLE_HISTORICAL_STATISTICS, misordered: ['VH_mean_asc', 'VV_mean_asc']})
    })

    it('are not a pass with another band read as one of its statistics', () => {
        expect(MONITORABLE_STATISTICS.evaluate(asset([...pass('asc'), band('VV_ratio_mean_asc', 0)])).diagnostic)
            .toMatchObject({code: INCOMPATIBLE_HISTORICAL_STATISTICS, unexpected: ['VV_ratio_mean_asc']})
    })

    it('ignore bands of no pass', () => {
        expect(MONITORABLE_STATISTICS.evaluate(asset([...pass('asc'), band('elevation', 0)])).status).toBe(SUPPORTED)
    })

    it('are not established, rather than incompatible, where the metadata states no rank', () => {
        const unstated = pass('asc').map(({name}) => band(name, undefined))

        expect(MONITORABLE_STATISTICS.evaluate(asset(unstated)).diagnostic)
            .toMatchObject({code: INSUFFICIENT_HISTORICAL_EVIDENCE, undetermined: unstated.map(({name}) => name)})
    })

    it('are not established where a pass that may be complete has no stated ranks, whatever another pass lacks', () => {
        const unstated = pass('desc').map(({name}) => band(name, undefined))

        expect(MONITORABLE_STATISTICS.evaluate(asset([...without(pass('asc'), 'orbit_asc'), ...unstated])).diagnostic)
            .toMatchObject({code: INSUFFICIENT_HISTORICAL_EVIDENCE, undetermined: unstated.map(({name}) => name)})
    })

    it('need a pass', () => {
        expect(MONITORABLE_STATISTICS.evaluate(asset([band('elevation', 0)])).diagnostic)
            .toMatchObject({code: NO_HISTORICAL_PASS, assetId: ASSET_ID})
    })

    it('are what a computing recipe builds for the passes it is configured with', () => {
        expect(MONITORABLE_STATISTICS.evaluate(computed(['ASCENDING']))).toEqual({status: SUPPORTED, passes: ['ASCENDING']})
        expect(MONITORABLE_STATISTICS.evaluate(computed([])).diagnostic.code).toBe(NO_HISTORICAL_PASS)
    })

    it('cannot be judged without facts', () => {
        expect(MONITORABLE_STATISTICS.evaluate(null)).toEqual({status: NEEDS_EVIDENCE})
    })
})

describe('the passes BAYTS alerts monitor', () => {
    it('are passes the statistics hold complete', () => {
        expect(MONITORED_PASSES.evaluate(asset([...pass('asc'), ...pass('desc')]), {orbits: ['ASCENDING', 'DESCENDING']}).status)
            .toBe(SUPPORTED)
    })

    it('need not be every pass the statistics hold, nor one they hold incompletely', () => {
        const facts = asset([...pass('asc'), ...without(pass('desc'), 'VH_speckle_desc')])

        expect(MONITORED_PASSES.evaluate(facts, {orbits: ['ASCENDING']}).status).toBe(SUPPORTED)
    })

    it('are not a pass the statistics do not hold, naming those that can be monitored instead', () => {
        expect(MONITORED_PASSES.evaluate(asset(pass('asc')), {orbits: ['ASCENDING', 'DESCENDING']}).diagnostic)
            .toEqual({code: MONITORED_PASS_ABSENT, assetId: ASSET_ID, absent: ['DESCENDING'], passes: ['ASCENDING']})
    })

    it('are not a pass held incompletely, said of that pass alone', () => {
        const facts = asset([...without(pass('asc'), 'VH_speckle_asc'), ...without(pass('desc'), 'orbit_desc')])

        expect(MONITORED_PASSES.evaluate(facts, {orbits: ['ASCENDING']}).diagnostic)
            .toMatchObject({code: INCOMPATIBLE_HISTORICAL_STATISTICS, missing: ['VH_speckle_asc']})
    })

    it('are not established where the ranks of a monitored pass are not stated', () => {
        const unstated = pass('asc').map(({name}) => band(name, undefined))

        expect(MONITORED_PASSES.evaluate(asset([...unstated, ...pass('desc')]), {orbits: ['ASCENDING']}).diagnostic)
            .toMatchObject({code: INSUFFICIENT_HISTORICAL_EVIDENCE, undetermined: unstated.map(({name}) => name)})
    })

    it('are passes a computing recipe is configured with', () => {
        expect(MONITORED_PASSES.evaluate(computed(['ASCENDING']), {orbits: ['DESCENDING']}).diagnostic)
            .toEqual({code: MONITORED_PASS_ABSENT, absent: ['DESCENDING'], passes: ['ASCENDING']})
    })

    it.each([
        ['a pass named alone', 'ASCENDING'],
        ['something other than a pass', ['ASCENDING', 'SIDEWAYS']],
        ['nothing', null]
    ])('are refused as malformed where configured as %s', (_case, orbits) => {
        expect(MONITORED_PASSES.evaluate(asset(pass('asc')), {orbits}).diagnostic)
            .toEqual({code: MALFORMED_MONITORED_PASSES, assetId: ASSET_ID, orbits})
    })

    it('are nothing to check where none are configured', () => {
        expect(MONITORED_PASSES.evaluate(asset(pass('asc')), {orbits: []}).status).toBe(SUPPORTED)
    })

    it('cannot be judged without facts', () => {
        expect(MONITORED_PASSES.evaluate(null, {orbits: ['ASCENDING']})).toEqual({status: NEEDS_EVIDENCE})
    })
})

const ASSET_ID = 'users/x/historical'
const STATISTICS = ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit', 'VV_speckle', 'VH_speckle']

const band = (name, arrayDimensions) => ({name, arrayDimensions})

const pass = suffix => STATISTICS.map(statistic => band(`${statistic}_${suffix}`, 0))

const without = (bands, ...names) => bands.filter(({name}) => !names.includes(name))

const asset = bands => ({producer: ASSET, assetId: ASSET_ID, bands})

const computed = passes => ({producer: COMPUTED, passes})
