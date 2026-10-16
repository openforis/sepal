import assert from 'node:assert/strict'
import {describe, it, mock} from 'node:test'

import {firstValueFrom} from 'rxjs'

// ee.Filter.* need an initialized EE API, so we mock '#sepal/ee/ee' (and the job wrapper / imageFactory that
// consumer modules import) with recording stubs and assert the FILTER STRUCTURE the shared code builds.
// Runtime matching (numeric vs string, zero results) is proven by the live EE smoke. This exercises the
// single shared rule plus all FOUR consumers routed through it: createFilter (EE Asset ImageCollection filter
// + Feature Layer filter), filterTable (generic EE-table selection), aoi (EE-table key selection) and the
// table-map By-value styling.

const record = (type, ...args) => ({type, args})
const Filter = {
    eq: (property, value) => record('eq', property, value),
    lt: (property, value) => record('lt', property, value),
    lte: (property, value) => record('lte', property, value),
    gt: (property, value) => record('gt', property, value),
    gte: (property, value) => record('gte', property, value),
    inList: (property, values) => record('inList', property, values),
    or: (...filters) => record('or', ...filters),
    and: (...filters) => record('and', ...filters)
}
// The map-source variant intentionally has no geometry() method. The table-map worker test therefore fails if
// viewport bounds are ever coupled back into map-id generation.
const mapFilteredTable = {style: style => record('styled', style)}
const mapSourceTable = {filter: () => mapFilteredTable}
const FeatureCollection = tableId => tableId === 'map-source'
    ? mapSourceTable
    : {
        size: () => record('size'),
        limit() {
            return {filter: filter => record('filtered', filter)}
        }
    }
const ImageCollection = images => ({mosaic: () => ({mosaicOf: images})})
const getMap$ = image => record('getMap$', image)

mock.module('#sepal/ee/ee', {
    exports: {
        default: {Filter, FeatureCollection, ImageCollection, getMap$}
    }
})
mock.module('#gee/jobs/job', {
    exports: {
        job: config => config
    }
})
mock.module('#sepal/ee/imageFactory', {
    exports: {
        default: () => ({getGeometry$: () => ({})})
    }
})

const {propertyEqualityFilter, propertyInListFilter} = await import('#sepal/ee/propertyFilter')
const {createFilter} = await import('#sepal/ee/asset/filter')
const {filterTable} = await import('#sepal/ee/table')
const {toFeatureCollection$} = await import('#sepal/ee/aoi')
const {styleByValue, worker$} = await import('#gee/jobs/ee/table/map')

const or = (a, b) => record('or', a, b)
const eq = (p, v) => record('eq', p, v)

describe('propertyEqualityFilter semantics', () => {
    it('number 8 -> eq(8)', () => assert.deepEqual(propertyEqualityFilter('p', 8), eq('p', 8)))
    it('number 0 -> eq(0)', () => assert.deepEqual(propertyEqualityFilter('p', 0), eq('p', 0)))
    it('"8" -> or(eq("8"), eq(8))', () => assert.deepEqual(propertyEqualityFilter('p', '8'), or(eq('p', '8'), eq('p', 8))))
    it('"08" -> or(eq("08"), eq(8))', () => assert.deepEqual(propertyEqualityFilter('p', '08'), or(eq('p', '08'), eq('p', 8))))
    it('"0" -> or(eq("0"), eq(0))', () => assert.deepEqual(propertyEqualityFilter('p', '0'), or(eq('p', '0'), eq('p', 0))))
    it('"forest" -> eq("forest")', () => assert.deepEqual(propertyEqualityFilter('p', 'forest'), eq('p', 'forest')))
    it('"" -> eq("")', () => assert.deepEqual(propertyEqualityFilter('p', ''), eq('p', '')))
    it('whitespace -> raw string only', () => assert.deepEqual(propertyEqualityFilter('p', '   '), eq('p', '   ')))
    it('null -> eq(null)', () => assert.deepEqual(propertyEqualityFilter('p', null), eq('p', null)))
    it('false -> eq(false)', () => assert.deepEqual(propertyEqualityFilter('p', false), eq('p', false)))

    it('never produces a duplicate numeric branch for an already-numeric value', () => {
        assert.deepEqual(propertyEqualityFilter('p', 8), eq('p', 8))
        assert.equal(propertyEqualityFilter('p', 8).type, 'eq')
    })
})

describe('propertyInListFilter semantics', () => {
    it('uses the equality contract for every selected value', () => {
        assert.deepEqual(propertyInListFilter('p', ['8', 'forest']), or(
            propertyEqualityFilter('p', '8'),
            propertyEqualityFilter('p', 'forest')
        ))
    })

    it('does not add an OR wrapper for one selected value', () => {
        assert.deepEqual(propertyInListFilter('p', ['8']), propertyEqualityFilter('p', '8'))
    })

    it('matches nothing for an empty selection', () => {
        assert.deepEqual(propertyInListFilter('p', []), record('inList', 'p', []))
    })
})

describe('createFilter (EE Asset + Feature Layer) routes equality through the shared helper', () => {
    const entry = constraints => [{booleanOperator: 'and', constraints}]
    const wrapped = f => record('and', record('and', f))

    it('uses propertyEqualityFilter for "="', () => {
        assert.deepEqual(
            createFilter(entry([{operator: '=', property: 'p', value: '8'}])),
            wrapped(propertyEqualityFilter('p', '8'))
        )
    })

    it('uses propertyInListFilter for categorical selections', () => {
        assert.deepEqual(
            createFilter(entry([{operator: 'class', property: 'p', selectedClasses: ['8', 'forest']}])),
            wrapped(propertyInListFilter('p', ['8', 'forest']))
        )
    })

    it('leaves ordered and range operators unchanged', () => {
        assert.deepEqual(
            createFilter(entry([{operator: '<', property: 'p', value: 5}])),
            wrapped(record('lt', 'p', 5))
        )
        assert.deepEqual(
            createFilter(entry([{operator: '≥', property: 'p', value: 5}])),
            wrapped(record('gte', 'p', 5))
        )
        assert.deepEqual(
            createFilter(entry([{operator: 'range', property: 'p', from: 1, fromInclusive: true, to: 3, toInclusive: false}])),
            wrapped(record('and', record('gte', 'p', 1), record('lt', 'p', 3)))
        )
    })
})

describe('filterTable (generic EE-table) routes through the shared helper', () => {
    it('filters the selected column via propertyEqualityFilter', () => {
        assert.deepEqual(
            filterTable({tableId: 't', columnName: 'p', columnValue: '8'}),
            record('filtered', propertyEqualityFilter('p', '8'))
        )
    })
})

describe('aoi EE-table key selection routes through the shared helper', () => {
    it('filters the key column via propertyEqualityFilter', async () => {
        const fc = await firstValueFrom(toFeatureCollection$({type: 'EE_TABLE', id: 't', keyColumn: 'id', key: '8'}))
        assert.deepEqual(fc, record('filtered', propertyEqualityFilter('id', '8')))
    })
})

describe('table-map By-value styling routes through the shared helper', () => {
    it('filters each listed value via propertyEqualityFilter', () => {
        const table = {filter: filter => ({style: () => ({styledWith: filter})})}
        const result = styleByValue(table, {
            colorMode: 'COLORS_BY_VALUE', valueProperty: 'code',
            valueColors: {'8': '#ffffff', forest: '#000000'}, fillOpacity: 0.5, width: 1, pointSize: 4
        })
        assert.deepEqual(result.mosaicOf.map(image => image.styledWith), [
            propertyEqualityFilter('code', '8'),
            propertyEqualityFilter('code', 'forest')
        ])
    })
})

describe('table-map worker', () => {
    it('creates the filtered map without evaluating collection bounds', () => {
        const featureFilter = JSON.stringify({
            booleanOperator: 'and',
            constraints: [{property: 'country', operator: '=', value: 'Sudan'}]
        })
        assert.deepEqual(worker$({requestArgs: {tableId: 'map-source', featureFilter}}), record(
            'getMap$',
            record('styled', {color: '#FFFFFF50', fillColor: '#FFFFFF08'})
        ))
    })
})
