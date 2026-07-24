import {describe, expect, it} from 'vitest'

import {arrangementCrsInvalidatesStratification} from './syncDependencies'

describe('arrangementCrsInvalidatesStratification', () => {
    const strat = crs => ({stratification: {skip: false}, sampleArrangement: {crs}})

    it('is true when a stratified design changes the arrangement CRS', () => {
        expect(arrangementCrsInvalidatesStratification(strat('EPSG:6933'), strat('EPSG:6931'))).toBe(true)
    })

    it('is false when the arrangement CRS is unchanged', () => {
        expect(arrangementCrsInvalidatesStratification(strat('EPSG:6933'), strat('EPSG:6933'))).toBe(false)
    })

    it('is false for a non-CRS arrangement change (e.g. seed)', () => {
        const prev = {stratification: {skip: false}, sampleArrangement: {crs: 'EPSG:6933', seed: 1}}
        const next = {stratification: {skip: false}, sampleArrangement: {crs: 'EPSG:6933', seed: 2}}
        expect(arrangementCrsInvalidatesStratification(prev, next)).toBe(false)
    })

    it('is false in an unstratified design: its areas come from AOI geometry, not the grid', () => {
        const prev = {stratification: {skip: true}, sampleArrangement: {crs: 'EPSG:6933'}}
        const next = {stratification: {skip: true}, sampleArrangement: {crs: 'EPSG:6931'}}
        expect(arrangementCrsInvalidatesStratification(prev, next)).toBe(false)
        expect(arrangementCrsInvalidatesStratification({stratification: {skip: [true]}, sampleArrangement: {crs: 'EPSG:6933'}},
            {stratification: {skip: [true]}, sampleArrangement: {crs: 'EPSG:6931'}})).toBe(false)
    })
})
