import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {format} from 'node:util'

import {assertMatches} from '#sepal/testSupport/assert'

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
        assert.deepEqual(MONITORABLE_STATISTICS.evaluate(asset([...pass('asc'), ...pass('desc')])), {status: SUPPORTED, passes: ['ASCENDING', 'DESCENDING']})
    })

    it('are an asset with one pass, which is what can be monitored', () => {
        assert.deepEqual(MONITORABLE_STATISTICS.evaluate(asset(pass('desc'))), {status: SUPPORTED, passes: ['DESCENDING']})
    })

    it('are a complete pass beside an incomplete one, which is the pass that can be monitored', () => {
        assert.deepEqual(MONITORABLE_STATISTICS.evaluate(asset([...pass('asc'), ...without(pass('desc'), 'VH_speckle_desc')])), {status: SUPPORTED, passes: ['ASCENDING']})
    })

    it('are not a pass missing a statistic', () => {
        assertMatches(MONITORABLE_STATISTICS.evaluate(asset(without(pass('desc'), 'VH_speckle_desc'))).diagnostic, {code: INCOMPATIBLE_HISTORICAL_STATISTICS, assetId: ASSET_ID, missing: ['VH_speckle_desc']})
    })

    it('are not statistics stored as arrays', () => {
        const bands = [...without(pass('asc'), 'VV_mean_asc'), band('VV_mean_asc', 1)]

        assertMatches(MONITORABLE_STATISTICS.evaluate(asset(bands)).diagnostic, {
            code: INCOMPATIBLE_HISTORICAL_STATISTICS, wrongDimensions: [{band: 'VV_mean_asc', expected: 0, actual: 1}]
        })
    })

    it('are not statistics stored VH before VV, which would be read as each other', () => {
        const bands = [
            band('VH_mean_asc', 0), band('VV_mean_asc', 0),
            ...without(pass('asc'), 'VV_mean_asc', 'VH_mean_asc')
        ]

        assertMatches(MONITORABLE_STATISTICS.evaluate(asset(bands)).diagnostic, {code: INCOMPATIBLE_HISTORICAL_STATISTICS, misordered: ['VH_mean_asc', 'VV_mean_asc']})
    })

    it('are not a pass with another band read as one of its statistics', () => {
        assertMatches(MONITORABLE_STATISTICS.evaluate(asset([...pass('asc'), band('VV_ratio_mean_asc', 0)])).diagnostic, {code: INCOMPATIBLE_HISTORICAL_STATISTICS, unexpected: ['VV_ratio_mean_asc']})
    })

    it('ignore bands of no pass', () => {
        assert.equal(MONITORABLE_STATISTICS.evaluate(asset([...pass('asc'), band('elevation', 0)])).status, SUPPORTED)
    })

    it('are not established, rather than incompatible, where the metadata states no rank', () => {
        const unstated = pass('asc').map(({name}) => band(name, undefined))

        assertMatches(MONITORABLE_STATISTICS.evaluate(asset(unstated)).diagnostic, {code: INSUFFICIENT_HISTORICAL_EVIDENCE, undetermined: unstated.map(({name}) => name)})
    })

    it('are not established where a pass that may be complete has no stated ranks, whatever another pass lacks', () => {
        const unstated = pass('desc').map(({name}) => band(name, undefined))

        assertMatches(MONITORABLE_STATISTICS.evaluate(asset([...without(pass('asc'), 'orbit_asc'), ...unstated])).diagnostic, {code: INSUFFICIENT_HISTORICAL_EVIDENCE, undetermined: unstated.map(({name}) => name)})
    })

    it('need a pass', () => {
        assertMatches(MONITORABLE_STATISTICS.evaluate(asset([band('elevation', 0)])).diagnostic, {code: NO_HISTORICAL_PASS, assetId: ASSET_ID})
    })

    it('are what a computing recipe builds for the passes it is configured with', () => {
        assert.deepEqual(MONITORABLE_STATISTICS.evaluate(computed(['ASCENDING'])), {status: SUPPORTED, passes: ['ASCENDING']})
        assert.equal(MONITORABLE_STATISTICS.evaluate(computed([])).diagnostic.code, NO_HISTORICAL_PASS)
    })

    it('cannot be judged without facts', () => {
        assert.deepEqual(MONITORABLE_STATISTICS.evaluate(null), {status: NEEDS_EVIDENCE})
    })
})

describe('the passes BAYTS alerts monitor', () => {
    it('are passes the statistics hold complete', () => {
        assert.equal(MONITORED_PASSES.evaluate(asset([...pass('asc'), ...pass('desc')]), {orbits: ['ASCENDING', 'DESCENDING']}).status, SUPPORTED)
    })

    it('need not be every pass the statistics hold, nor one they hold incompletely', () => {
        const facts = asset([...pass('asc'), ...without(pass('desc'), 'VH_speckle_desc')])

        assert.equal(MONITORED_PASSES.evaluate(facts, {orbits: ['ASCENDING']}).status, SUPPORTED)
    })

    it('are not a pass the statistics do not hold, naming those that can be monitored instead', () => {
        assert.deepEqual(MONITORED_PASSES.evaluate(asset(pass('asc')), {orbits: ['ASCENDING', 'DESCENDING']}).diagnostic, {code: MONITORED_PASS_ABSENT, assetId: ASSET_ID, absent: ['DESCENDING'], passes: ['ASCENDING']})
    })

    it('are not a pass held incompletely, said of that pass alone', () => {
        const facts = asset([...without(pass('asc'), 'VH_speckle_asc'), ...without(pass('desc'), 'orbit_desc')])

        assertMatches(MONITORED_PASSES.evaluate(facts, {orbits: ['ASCENDING']}).diagnostic, {code: INCOMPATIBLE_HISTORICAL_STATISTICS, missing: ['VH_speckle_asc']})
    })

    it('are not established where the ranks of a monitored pass are not stated', () => {
        const unstated = pass('asc').map(({name}) => band(name, undefined))

        assertMatches(MONITORED_PASSES.evaluate(asset([...unstated, ...pass('desc')]), {orbits: ['ASCENDING']}).diagnostic, {code: INSUFFICIENT_HISTORICAL_EVIDENCE, undetermined: unstated.map(({name}) => name)})
    })

    it('are passes a computing recipe is configured with', () => {
        assert.deepEqual(MONITORED_PASSES.evaluate(computed(['ASCENDING']), {orbits: ['DESCENDING']}).diagnostic, {code: MONITORED_PASS_ABSENT, absent: ['DESCENDING'], passes: ['ASCENDING']})
    })

    for (const [_case, orbits] of [
        ['a pass named alone', 'ASCENDING'],
        ['something other than a pass', ['ASCENDING', 'SIDEWAYS']],
        ['nothing', null]
    ]) {
        it(format('are refused as malformed where configured as %s', _case), () => {
            assert.deepEqual(MONITORED_PASSES.evaluate(asset(pass('asc')), {orbits}).diagnostic, {code: MALFORMED_MONITORED_PASSES, assetId: ASSET_ID, orbits})
        })
    }

    it('are nothing to check where none are configured', () => {
        assert.equal(MONITORED_PASSES.evaluate(asset(pass('asc')), {orbits: []}).status, SUPPORTED)
    })

    it('cannot be judged without facts', () => {
        assert.deepEqual(MONITORED_PASSES.evaluate(null, {orbits: ['ASCENDING']}), {status: NEEDS_EVIDENCE})
    })
})

const ASSET_ID = 'users/x/historical'
const STATISTICS = ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit', 'VV_speckle', 'VH_speckle']

const band = (name, arrayDimensions) => ({name, arrayDimensions})

const pass = suffix => STATISTICS.map(statistic => band(`${statistic}_${suffix}`, 0))

const without = (bands, ...names) => bands.filter(({name}) => !names.includes(name))

const asset = bands => ({producer: ASSET, assetId: ASSET_ID, bands})

const computed = passes => ({producer: COMPUTED, passes})
