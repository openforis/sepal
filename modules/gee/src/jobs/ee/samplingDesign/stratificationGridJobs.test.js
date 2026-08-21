import {jest} from '@jest/globals'
import {of} from 'rxjs'

import {EASE_GRID_2_GLOBAL_WKT, resolveStratificationCrs} from '#sepal/recipe/samplingDesign/samplingGridCrs'

// Area and anticipated proportions read the CATEGORICAL source, so they evaluate on the Stratification grid and
// must accept any projected CRS - not just the curated equal-area Arrangement catalog.
describe('area and proportions resolve the Stratification CRS', () => {
    it('translates EPSG:6933 to the WKT Earth Engine can parse', () => {
        expect(resolveStratificationCrs('EPSG:6933')).toBe(EASE_GRID_2_GLOBAL_WKT)
    })

    it('accepts a non-curated projected CRS that the Arrangement resolver would reject', () => {
        expect(resolveStratificationCrs('EPSG:32636')).toBe('EPSG:32636')
    })
})

// The projection every Sampling Design reduction and the final draw run on, asserted as the GRAPH it builds:
// ee.* needs an initialized API, so recording stubs stand in for it (the house pattern from
// table/propertyFilter.test.js) and the real behaviour of the operators is what the live checkpoint proved.
//
// The stub REFUSES crs() and transform(). Both are real Earth Engine methods that look usable here and are not:
// a WKT-defined projection reports a null crs(), and transform() has been observed returning a WKT string
// rather than six numbers.
const bool = spec => ({spec, and: other => bool({and: [spec, other.spec]})})
const number = spec => ({
    spec,
    subtract: other => number({subtract: [spec, other]}),
    abs: () => number({abs: spec}),
    lte: other => bool({lte: [spec, other]}),
    eq: other => bool({eq: [spec, other]})
})
const text = spec => ({spec, compareTo: other => number({compareTo: [spec, other.spec]})})
const projection = spec => ({
    spec,
    atScale: scale => projection({atScale: [spec, scale]}),
    wkt: () => text({wkt: spec}),
    nominalScale: () => number({nominalScale: spec}),
    crs: () => { throw new Error('projection.crs() is not usable: a WKT projection reports null') },
    transform: () => { throw new Error('projection.transform() is not usable: it can return a WKT string') }
})
const image = spec => ({
    spec,
    select: bands => image({select: [spec, bands]}),
    rename: name => image({rename: [spec, name]}),
    mask: () => image({mask: spec}),
    updateMask: other => image({updateMask: [spec, other.spec]}),
    addBands: other => image({addBands: [spec, other.spec]}),
    multiply: other => image({multiply: [spec, other.spec]}),
    eq: other => image({eq: [spec, other]}),
    reproject: value => image({reproject: [spec, value]}),
    projection: () => projection({of: spec}),
    reduceRegion: args => ({reduceRegion: args})
})
const reducer = spec => ({
    spec,
    setOutputs: outputs => reducer({setOutputs: [spec, outputs]}),
    combine: ({reducer2}) => reducer({combine: [spec, reducer2.spec]}),
    group: (index, name) => reducer({group: [spec, index, name]}),
    forEach: names => reducer({forEach: [spec, names]})
})

const ee = {
    Image: value => image({Image: value}),
    Projection: value => projection({Projection: value}),
    // A candidate chain nests: the false branch of one If is the next If, which is a bare record rather than a
    // wrapped Earth Engine object.
    Algorithms: {If: (condition, ifTrue, ifFalse) => ({If: [condition.spec, ifTrue.spec ?? ifTrue, ifFalse.spec ?? ifFalse]})},
    Reducer: {sum: () => reducer({sum: true}), first: () => reducer({first: true})},
    // The area job unwraps `groups` from the evaluated dictionary, so this hands the graph itself back and the
    // test can read the reduction it built.
    getInfo$: value => of({groups: value})
}
ee.Image.pixelArea = () => image({pixelArea: true})

jest.unstable_mockModule('#sepal/ee/ee', () => ({default: ee}))
jest.unstable_mockModule('#gee/jobs/job', () => ({job: config => config}))
jest.unstable_mockModule('#sepal/ee/aoi', () => ({toGeometry$: () => of({geometry: true})}))
jest.unstable_mockModule('#sepal/ee/imageFactory', () => ({
    default: () => ({getImage$: () => of(image({source: 'asset'}))})
}))
jest.unstable_mockModule('#gee/jobs/ee/batch/exportToCSV', () => ({exportToCSV$: () => of({})}))
jest.unstable_mockModule('#gee/jobs/ee/batch/parse', () => ({parseGroups: value => value}))

const {stratificationImage$, stratificationProjection} = await import('#sepal/ee/samplingDesign/stratificationImage')
const {weightedAreaSums} = await import('#gee/jobs/ee/samplingDesign/weightedAreaSums')
const {default: areaPerStratum} = await import('#gee/jobs/ee/samplingDesign/areaPerStratum')

const emit = obs => {
    let value
    obs.subscribe(v => { value = v })
    return value
}

describe('the Stratification projection', () => {
    const bandProjection = projection({band: 'label'})
    const decision = ({crs = 'EPSG:4326', scale = 10} = {}) =>
        stratificationProjection([bandProjection], {crs, scale})?.spec?.Projection?.If || []
    const configuredOf = options => decision(options)[2]
    const conditionOf = options => decision(options)[0]?.and || []

    it('chooses between the candidate and the configured projection server-side', () => {
        expect(decision()).toHaveLength(3)
        expect(decision()[1]).toEqual(bandProjection.spec)
    })

    it('builds the configured projection from the CRS at the configured Scale', () => {
        expect(configuredOf({crs: 'EPSG:4326', scale: 30}))
            .toEqual({atScale: [{Projection: 'EPSG:4326'}, 30]})
    })

    it('resolves the configured CRS at the Earth Engine boundary', () => {
        expect(configuredOf({crs: 'EPSG:6933', scale: 30}))
            .toEqual({atScale: [{Projection: EASE_GRID_2_GLOBAL_WKT}, 30]})
    })

    it('accepts a Scale that arrives as a string, as recipe values do', () => {
        expect(configuredOf({scale: '30'})).toEqual({atScale: [{Projection: 'EPSG:4326'}, 30]})
    })

    // Canonical WKT on both sides: it is the only equivalence Earth Engine can be asked for here.
    it('compares the two projections by canonical WKT', () => {
        const [wktMatch] = conditionOf()
        expect(wktMatch).toEqual({
            eq: [{compareTo: [{wkt: bandProjection.spec}, {wkt: {atScale: [{Projection: 'EPSG:4326'}, 10]}}]}, 0]
        })
    })

    // A displayed Scale is rounded to four decimals, so the band's own scale and the value the user was shown
    // differ by a rounding error rather than by a resolution.
    it('additionally requires the nominal Scale to agree within 0.0001 m', () => {
        const [, scaleMatch] = conditionOf({scale: 10})
        expect(scaleMatch).toEqual({
            lte: [{abs: {subtract: [{nominalScale: bandProjection.spec}, 10]}}, 0.0001]
        })
    })
})

// A stratified proportion reduction has TWO grids that could already be right: the strata it groups by and the
// property it reads. The Scale is the coarser of the two, so with 30 m strata over a 10 m property the 30 m
// grid IS the stratification lattice - and resampling it onto a fresh origin-zero 30 m grid would shift every
// stratum boundary. Candidates are therefore ordered, and the first one that matches wins.
describe('ordered candidates', () => {
    const strata = projection({band: 'class'})
    const property = projection({band: 'probability'})
    const decision = (candidates, {crs = 'EPSG:4326', scale = 30} = {}) =>
        stratificationProjection(candidates, {crs, scale})?.spec?.Projection?.If || []

    it('offers the stratification band before the property band', () => {
        const [, first, rest] = decision([strata, property])
        expect(first).toEqual(strata.spec)
        expect(rest.If[1]).toEqual(property.spec)
    })

    it('falls through to the configured projection when neither candidate matches', () => {
        const [, , rest] = decision([strata, property])
        expect(rest.If[2]).toEqual({atScale: [{Projection: 'EPSG:4326'}, 30]})
    })

    it('tests every candidate by the same canonical-WKT and scale-tolerance rule', () => {
        const [strataCondition, , rest] = decision([strata, property])
        const [wkt, scale] = strataCondition.and
        expect(wkt).toEqual({eq: [{compareTo: [{wkt: strata.spec}, {wkt: {atScale: [{Projection: 'EPSG:4326'}, 30]}}]}, 0]})
        expect(scale).toEqual({lte: [{abs: {subtract: [{nominalScale: strata.spec}, 30]}}, 0.0001]})
        expect(rest.If[0].and[0].eq[0].compareTo[0]).toEqual({wkt: property.spec})
    })

    it('offers only the candidate it is given', () => {
        const [, first, rest] = decision([property])
        expect(first).toEqual(property.spec)
        expect(rest).toEqual({atScale: [{Projection: 'EPSG:4326'}, 30]})
    })
})

describe('the consumers of the Stratification projection', () => {
    const gridArgs = {aoi: {}, stratification: {type: 'ASSET', id: 'users/x/strata'}, band: 'label', crs: 'EPSG:4326', scale: 10}

    // The projection carries its own scale, so passing one alongside would describe a second grid.
    it('area per stratum reduces on the selected projection and adds no scale', () => {
        const {reduceRegion} = emit(areaPerStratum.worker$({requestArgs: gridArgs, credentials: {}}))
        expect(reduceRegion.crs?.spec?.Projection?.If || []).toHaveLength(3)
        expect('scale' in reduceRegion).toBe(false)
    })

    it('area per stratum reads the projection of the SELECTED band', () => {
        const {reduceRegion} = emit(areaPerStratum.worker$({requestArgs: gridArgs, credentials: {}}))
        expect(reduceRegion.crs?.spec?.Projection?.If?.[1]).toEqual({of: {select: [{source: 'asset'}, 'label']}})
    })

    const proportions = ({stratified}) => weightedAreaSums({
        eeGeometry: {}, eeStratification: image({source: 'strata'}), eeProbability: image({source: 'probability'}),
        stratificationBand: 'class', probabilityBand: 'p', mode: 'PROBABILITY', scale: 30, crs: 'EPSG:4326', stratified
    })

    it('stratified proportions offer the strata lattice before the property band, with no scale', () => {
        const {reduceRegion} = proportions({stratified: true})
        const decision = reduceRegion.crs?.spec?.Projection?.If
        expect(decision?.[1]).toEqual({of: {select: [{source: 'strata'}, 'class']}})
        expect(decision?.[2]?.If?.[1]).toEqual({of: {select: [{source: 'probability'}, 'p']}})
        expect('scale' in reduceRegion).toBe(false)
    })

    // With no strata there is no lattice to preserve: the synthetic constant image has Earth Engine's
    // degree-scale default projection, which must never be offered as a grid to snap to.
    it('unstratified proportions offer the property band only', () => {
        const decision = proportions({stratified: false}).reduceRegion.crs?.spec?.Projection?.If
        expect(decision?.[1]).toEqual({of: {select: [{source: 'probability'}, 'p']}})
        expect(decision?.[2]).toEqual({atScale: [{Projection: 'EPSG:4326'}, 30]})
    })

    it('the final sampling image reprojects exactly once, onto the same selected projection', () => {
        const result = emit(stratificationImage$(
            {type: 'ASSET', assetId: 'users/x/strata', band: 'label'},
            {crs: 'EPSG:4326', scale: 10}
        ))
        const [renamed, reprojection] = result.spec.reproject
        expect(renamed).toEqual({rename: [{select: [{source: 'asset'}, 'label']}, 'stratum']})
        expect(reprojection?.spec?.Projection?.If?.[1]).toEqual({of: {select: [{source: 'asset'}, 'label']}})
    })
})
