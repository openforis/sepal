import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {modelToValues, syntheticUnstratifiedStratum, unstratifiedStrata, valuesToModel} = await import('./stratificationModel')

// A canonical saved stratification model: the exact shape valuesToModel produces (no transient requiresUpdate).
const savedModel = {
    skip: false,
    scale: 30,
    crs: 'EPSG:6933',
    crsTransform: '',
    type: 'ASSET',
    assetId: 'users/test/strata',
    recipeId: undefined,
    band: 'class',
    strata: [{value: 1, stratum: 1, area: 100, weight: 1}],
    eeStrategy: 'ONLINE'
}

describe('modelToValues', () => {
    it('initializes requiresUpdate to false for an up-to-date model, so requiresUpdate.set(false) is a no-op', () => {
        expect(modelToValues({...savedModel, requiresUpdate: false}).requiresUpdate).toBe(false)
        expect(modelToValues(savedModel).requiresUpdate).toBe(false)
    })

    it('preserves requiresUpdate: true so a stale model recalculates on open', () => {
        expect(modelToValues({...savedModel, requiresUpdate: true}).requiresUpdate).toBe(true)
    })

    it('applies the ONLINE eeStrategy default only when missing', () => {
        expect(modelToValues({...savedModel, eeStrategy: undefined}).eeStrategy).toBe('ONLINE')
        expect(modelToValues({...savedModel, eeStrategy: 'BATCH'}).eeStrategy).toBe('BATCH')
    })

    it('keeps scale as-is (no numeric/string coercion that would mismatch the model)', () => {
        expect(modelToValues({...savedModel, scale: 30}).scale).toBe(30)
    })

    it('defaults the stratification grid crs to EPSG:6933 for a recipe saved before it existed, and carries an explicit choice through', () => {
        expect(modelToValues({...savedModel, crs: undefined}).crs).toBe('EPSG:6933')
        expect(modelToValues({...savedModel, crs: 'EPSG:6931'}).crs).toBe('EPSG:6931')
    })

    it('defaults crsTransform to empty and round-trips a set value', () => {
        expect(modelToValues({...savedModel, crsTransform: undefined}).crsTransform).toBe('')
        expect(modelToValues({...savedModel, crsTransform: '[30,0,0,0,-30,0]'}).crsTransform).toBe('[30,0,0,0,-30,0]')
    })
})

describe('valuesToModel', () => {
    it('parses scale to a number for both numeric and string form values', () => {
        expect(valuesToModel({scale: 30}).scale).toBe(30)
        expect(valuesToModel({scale: '30'}).scale).toBe(30)
    })

    it('stores the stratification grid crs, defaulting to the curated default', () => {
        expect(valuesToModel({scale: 30, crs: 'EPSG:6931'}).crs).toBe('EPSG:6931')
        expect(valuesToModel({scale: 30, crs: undefined}).crs).toBe('EPSG:6933')
    })

    it('stores the stratification grid crsTransform, defaulting to empty', () => {
        expect(valuesToModel({scale: 30, crsTransform: '[30,0,0,0,-30,0]'}).crsTransform).toBe('[30,0,0,0,-30,0]')
        expect(valuesToModel({scale: 30, crsTransform: undefined}).crsTransform).toBe('')
    })

    it('drops scale when a crsTransform defines the grid (mutually exclusive)', () => {
        expect(valuesToModel({scale: 30, crsTransform: '[30,0,0,0,-30,0]'}).scale).toBeUndefined()
        expect(valuesToModel({scale: 30, crsTransform: ''}).scale).toBe(30)
    })

    it('does not carry the transient requiresUpdate flag into the model', () => {
        expect('requiresUpdate' in valuesToModel({...savedModel, requiresUpdate: true})).toBe(false)
    })
})

describe('round trip', () => {
    it('valuesToModel(modelToValues(savedModel)) preserves the canonical saved model shape', () => {
        expect(valuesToModel(modelToValues(savedModel))).toEqual(savedModel)
    })
})

describe('syntheticUnstratifiedStratum', () => {
    it('is a single synthetic row with no area (area is filled at the export boundary)', () => {
        const row = syntheticUnstratifiedStratum('Area of interest')
        expect(row).toEqual({color: '#000000', label: 'Area of interest', value: 1, stratum: 1, weight: 1})
        expect('area' in row).toBe(false)
    })
})

describe('unstratifiedStrata', () => {
    it('accepts the synthetic row without requiring an area (unstratified is valid before area is computed)', () => {
        const result = unstratifiedStrata([{color: '#000000', label: 'AOI', value: 1, stratum: 1, weight: 1}])
        expect(result).toEqual([{color: '#000000', label: 'AOI', value: 1, stratum: 1, weight: 1}])
        expect('area' in result[0]).toBe(false)
    })

    it('carries a finite positive area through when one is present', () => {
        expect(unstratifiedStrata([{label: 'AOI', area: 1.2e9}])[0].area).toBe(1.2e9)
    })

    it('does not treat stale multi-row stratified data as a valid unstratified result', () => {
        expect(unstratifiedStrata([{value: 1, area: 3e8}, {value: 2, area: 7e8}])).toEqual([])
    })

    it('round-trips an unstratified model (skip) with no area', () => {
        const values = {skip: [true], scale: 30, type: 'ASSET', strata: [{label: 'AOI', color: '#000000', value: 1, stratum: 1, weight: 1}]}
        const model = valuesToModel(values)
        expect(model.skip).toBe(true)
        expect(model.strata).toEqual([{color: '#000000', label: 'AOI', value: 1, stratum: 1, weight: 1}])
        expect('area' in model.strata[0]).toBe(false)
    })
})
