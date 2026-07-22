import {jest} from '@jest/globals'

// ee.Filter.* need an initialized EE API, so we mock '#sepal/ee/ee' with recording stubs and assert the
// FILTER STRUCTURE the shared code builds. Runtime matching (numeric vs string, zero results) is proven by the
// live EE smoke. This covers the two consumers of the shared equality behavior: createFilter (EE Asset
// ImageCollection property filtering AND the Feature Layer filter) and filterTable (AOI/EE-table filtering).

const record = (type, ...args) => ({type, args})
const Filter = {
    eq: (property, value) => record('eq', property, value),
    lt: (property, value) => record('lt', property, value),
    lte: (property, value) => record('lte', property, value),
    gt: (property, value) => record('gt', property, value),
    gte: (property, value) => record('gte', property, value),
    or: (...filters) => record('or', ...filters),
    and: (...filters) => record('and', ...filters)
}
const FeatureCollection = () => ({
    size: () => record('size'),
    limit() {
        return {filter: filter => record('filtered', filter)}
    }
})

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: {Filter, FeatureCollection}}))

const {equalityFilter, createFilter} = await import('#sepal/ee/asset/filter')
const {filterTable} = await import('#sepal/ee/table')

const entry = constraints => [{booleanOperator: 'and', constraints}]
// createFilter wraps: and(entries) -> per entry and/or(constraints).
const wrapped = constraintFilter => record('and', record('and', constraintFilter))

describe('equalityFilter', () => {
    it('matches a numeric-string property: "8" checks string "8" AND number 8', () => {
        expect(equalityFilter('p', '8')).toEqual(record('or', record('eq', 'p', '8'), record('eq', 'p', 8)))
    })

    it('matches a genuinely string-valued property (the string operand is always present)', () => {
        expect(equalityFilter('p', '8').args[0]).toEqual(record('eq', 'p', '8'))
    })

    it('keeps non-numeric text ("forest") a single string comparison (no or-wrapper)', () => {
        expect(equalityFilter('p', 'forest')).toEqual(record('eq', 'p', 'forest'))
    })

    it('checks both "0" and 0 for zero', () => {
        expect(equalityFilter('p', '0')).toEqual(record('or', record('eq', 'p', '0'), record('eq', 'p', 0)))
    })

    it('checks both "08" and 8 (types are not exposed by the UI)', () => {
        expect(equalityFilter('p', '08')).toEqual(record('or', record('eq', 'p', '08'), record('eq', 'p', 8)))
    })

    it('uses ONE exact comparison for an already-numeric value (no duplicate or(eq(8), eq(8)))', () => {
        expect(equalityFilter('p', 8)).toEqual(record('eq', 'p', 8))
        expect(equalityFilter('p', 0)).toEqual(record('eq', 'p', 0))
    })

    it('does NOT coerce blank-like values to numeric 0', () => {
        // '', whitespace, null, false all toNumber-coerce to 0; equality must stay a single (string) eq.
        expect(equalityFilter('p', '')).toEqual(record('eq', 'p', ''))
        expect(equalityFilter('p', '   ')).toEqual(record('eq', 'p', '   '))
        expect(equalityFilter('p', null)).toEqual(record('eq', 'p', null))
        expect(equalityFilter('p', false)).toEqual(record('eq', 'p', false))
    })
})

describe('createFilter equality (EE Asset + Feature Layer)', () => {
    it('uses the shared dual equality for "="', () => {
        const filter = createFilter(entry([{operator: '=', property: 'p', value: '8'}]))
        expect(filter).toEqual(wrapped(record('or', record('eq', 'p', '8'), record('eq', 'p', 8))))
    })

    it('leaves ordered operators unchanged', () => {
        expect(createFilter(entry([{operator: '<', property: 'p', value: 5}]))).toEqual(wrapped(record('lt', 'p', 5)))
        expect(createFilter(entry([{operator: '≥', property: 'p', value: 5}]))).toEqual(wrapped(record('gte', 'p', 5)))
    })

    it('leaves range unchanged', () => {
        const filter = createFilter(entry([{operator: 'range', property: 'p', from: 1, fromInclusive: true, to: 3, toInclusive: false}]))
        expect(filter).toEqual(wrapped(record('and', record('gte', 'p', 1), record('lt', 'p', 3))))
    })
})

describe('filterTable (AOI / EE-table) equality', () => {
    it('applies the shared dual equality on the selected column', () => {
        expect(filterTable({tableId: 't', columnName: 'p', columnValue: '8'}))
            .toEqual(record('filtered', record('or', record('eq', 'p', '8'), record('eq', 'p', 8))))
    })

    it('returns the collection unfiltered when no column is selected', () => {
        const table = filterTable({tableId: 't'})
        expect(typeof table.limit).toBe('function')
    })
})
