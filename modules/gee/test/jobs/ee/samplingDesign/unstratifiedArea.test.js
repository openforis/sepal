import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {of} from 'rxjs'

import {collectionMetadata, strataMetadata} from '#sepal/ee/samplingDesign/sampleProperties'
import {systematicStratumMaxOffset} from '#sepal/ee/samplingDesign/samples'
import {AOI_AREA_MAX_ERROR_METERS, unstratifiedAllocation$, withUnstratifiedArea} from '#sepal/ee/samplingDesign/unstratifiedArea'

const spy = (impl = () => {}) => {
    const fn = (...args) => {
        fn.calls.push(args)
        return impl(...args)
    }
    fn.calls = []
    return fn
}

// of() emits synchronously, so we can read the emitted value inline.
const emit = obs => {
    let value
    obs.subscribe(v => { value = v })
    return value
}

const syntheticRow = {stratum: 1, value: 1, label: 'Area of interest', color: '#000000', weight: 1, sampleSize: 100}

describe('withUnstratifiedArea', () => {
    it('stamps the AOI area onto the single synthetic unstratified row', () => {
        assert.deepEqual(
            withUnstratifiedArea([syntheticRow], 1.2e9),
            [{...syntheticRow, area: 1.2e9}]
        )
    })
})

describe('unstratifiedAllocation$', () => {
    it('injects the AOI geometry area (geometry.area, getInfo\'d) for an unstratified design', () => {
        const areaObject = {isArea: true}
        const geometry = {area: spy(() => areaObject)}
        const getInfo$ = spy(() => of(1.2e9))
        const result = emit(unstratifiedAllocation$({
            allocation: [syntheticRow],
            stratification: {skip: true},
            geometry,
            getInfo$
        }))
        assert.equal(geometry.area.calls[0][0], AOI_AREA_MAX_ERROR_METERS)
        assert.equal(getInfo$.calls[0][0], areaObject)
        assert.deepEqual(result, [{...syntheticRow, area: 1.2e9}])
    })

    it('supports the old non-empty form-toggle skip shape', () => {
        const geometry = {area: spy(() => ({}))}
        const result = emit(unstratifiedAllocation$({
            allocation: [syntheticRow],
            stratification: {skip: ['skip']},
            geometry,
            getInfo$: () => of(1.2e9)
        }))
        assert.deepEqual(result, [{...syntheticRow, area: 1.2e9}])
    })

    it('passes a stratified allocation through unchanged and makes no area request', () => {
        const geometry = {area: spy()}
        const getInfo$ = spy(() => of(999))
        const allocation = [
            {stratum: 1, area: 3e8, sampleSize: 30},
            {stratum: 2, area: 7e8, sampleSize: 70}
        ]
        const result = emit(unstratifiedAllocation$({allocation, stratification: {skip: false}, geometry, getInfo$}))
        assert.equal(result, allocation)
        assert.deepEqual(geometry.area.calls, [])
        assert.deepEqual(getInfo$.calls, [])
    })

    it('treats the old empty form-toggle skip shape as stratified', () => {
        const geometry = {area: spy()}
        const getInfo$ = spy(() => of(999))
        const allocation = [
            {stratum: 1, area: 3e8, sampleSize: 30},
            {stratum: 2, area: 7e8, sampleSize: 70}
        ]
        const result = emit(unstratifiedAllocation$({allocation, stratification: {skip: []}, geometry, getInfo$}))
        assert.equal(result, allocation)
        assert.deepEqual(geometry.area.calls, [])
        assert.deepEqual(getInfo$.calls, [])
    })
})

describe('injected area flows into exported metadata', () => {
    it('exposes the injected AOI area in the collection-level strata metadata', () => {
        const allocation = withUnstratifiedArea([syntheticRow], 1.2e9)
        assert.equal(strataMetadata(allocation)[0].area, 1.2e9)
        const metadata = collectionMetadata({allocation, reproduction: {}})
        assert.equal(JSON.parse(metadata.strata)[0].area, 1.2e9)
    })
})

// Proof for systematic exports: the density/max-offset decision reads stratum.area, so it MUST run on the
// area-injected allocation. A no-area synthetic row collapses the max offset to 0 (density would never
// densify); the injected area restores a real offset. This fails if the resolved allocation is bypassed.
describe('systematic max-offset requires the injected area (unstratified)', () => {
    const sampleArrangement = {minDistance: 60, stratificationGrid: {crs: 'EPSG:6933', scale: 30}}

    it('collapses to 0 for a no-area synthetic row', () => {
        assert.equal(
            systematicStratumMaxOffset({stratum: 1, value: 1, sampleSize: 100}, sampleArrangement),
            0
        )
    })

    it('yields a real (non-zero) max offset once unstratifiedAllocation$ injects the AOI area', () => {
        const [resolved] = emit(unstratifiedAllocation$({
            allocation: [{stratum: 1, value: 1, sampleSize: 100}],
            stratification: {skip: true},
            geometry: {area: () => ({})},
            getInfo$: () => of(1.2e9)
        }))
        assert.ok(systematicStratumMaxOffset(resolved, sampleArrangement) > 0)
    })
})
