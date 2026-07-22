import {isFeatureLayerFilterValid, resolveFeatureLayerFilter} from './featureLayerFilter'

const filter = constraints => ({booleanOperator: 'and', constraints})

describe('resolveFeatureLayerFilter', () => {
    it('defaults to an empty all-match filter', () => {
        expect(resolveFeatureLayerFilter()).toEqual({booleanOperator: 'and', constraints: []})
    })

    it('preserves a supported persisted filter', () => {
        const persisted = {booleanOperator: 'or', constraints: [{id: 'a', property: 'class', operator: '=', value: 'forest'}]}
        expect(resolveFeatureLayerFilter({layerConfig: {filter: persisted}})).toEqual(persisted)
    })

    it('normalizes malformed structure', () => {
        expect(resolveFeatureLayerFilter({layerConfig: {filter: {booleanOperator: 'xor', constraints: {}}}}))
            .toEqual({booleanOperator: 'and', constraints: []})
    })
})

describe('isFeatureLayerFilterValid', () => {
    it('accepts an empty filter', () => {
        expect(isFeatureLayerFilterValid({filter: filter([])})).toBe(true)
    })

    it('accepts string and numeric equality values, including zero', () => {
        expect(isFeatureLayerFilterValid({filter: filter([
            {property: 'class', operator: '=', value: 'forest'},
            {property: 'code', operator: '=', value: 0}
        ])})).toBe(true)
    })

    it('requires finite numbers for ordered and range comparisons', () => {
        expect(isFeatureLayerFilterValid({filter: filter([
            {property: 'score', operator: '≥', value: 3},
            {property: 'area', operator: 'range', from: 10, to: 20}
        ])})).toBe(true)
        expect(isFeatureLayerFilterValid({filter: filter([
            {property: 'score', operator: '>', value: NaN}
        ])})).toBe(false)
    })

    it('rejects incomplete and currently-invalid constraints', () => {
        expect(isFeatureLayerFilterValid({filter: filter([{property: '', operator: '=', value: 'x'}])})).toBe(false)
        expect(isFeatureLayerFilterValid({
            filter: filter([{id: 'a', property: 'class', operator: '=', value: 'forest'}]),
            invalidById: {a: true}
        })).toBe(false)
    })
})
