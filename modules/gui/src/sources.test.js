import {describe, expect, it, vi} from 'vitest'

import {collectionMeasures} from '#sepal/recipe/collectionBands'

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))

const {getAvailableBands, groupedBandOptions, toSources, withChosenBands} = await import('./sources')

// What a Sentinel-1 collection offers a temporal consumer - CCDC's base bands, the time-series and change-alerts
// charts - one value per image: not what a Radar Mosaic composites it into.
describe('the measures of a Sentinel-1 collection', () => {
    it('are its polarisations, their ratio and the orbit', () => {
        expect(getAvailableBands({dataSets: ['SENTINEL_1']})).toEqual(['VV', 'VH', 'ratio_VV_VH', 'orbit'])
    })

    it('are offered with the orbit on its own, as a whole number', () => {
        expect(groupedBandOptions({dataSets: ['SENTINEL_1']})).toEqual([
            [
                {value: 'VV', label: 'VV', dataType: {precision: 'float'}},
                {value: 'VH', label: 'VH', dataType: {precision: 'float'}},
                {value: 'ratio_VV_VH', label: 'ratio_VV_VH', dataType: {precision: 'float'}}
            ],
            [{value: 'orbit', label: 'orbit', dataType: {precision: 'int'}}],
            []
        ])
    })
})

// What a temporal consumer offers over a Planet collection: the choices it has always offered, which Planet Mosaic's
// kndvi does not extend.
describe('the choices over a Planet collection', () => {
    const int10000 = {precision: 'int', min: -10000, max: 10000}
    const option = value => ({value, label: value, dataType: int10000})

    it('are its spectral bands and five indexes', () => {
        expect(getAvailableBands({dataSets: ['DAILY']}))
            .toEqual(['blue', 'green', 'red', 'nir', 'ndvi', 'ndwi', 'evi', 'evi2', 'savi'])
    })

    it('are offered with the spectral bands before the indexes', () => {
        expect(groupedBandOptions({dataSets: ['NICFI']})).toEqual([
            ['blue', 'green', 'red', 'nir'].map(option),
            ['ndvi', 'ndwi', 'evi', 'evi2', 'savi'].map(option),
            []
        ])
    })
})

// The outputs offered of a collection's Classification are those its classifier's configuration supports: an SVM's
// type decides whether it offers class probabilities, and none of them a regression.
describe('the classified outputs offered of a collection', () => {
    const LEGEND = {entries: [{value: 1, label: 'forest'}, {value: 2, label: 'other'}]}
    const offered = classification => getAvailableBands({
        dataSets: ['SENTINEL_1'],
        classification: {classificationLegend: LEGEND, include: ['regression', 'probabilities'], ...classification}
    }).filter(band => !['VV', 'VH', 'ratio_VV_VH', 'orbit'].includes(band))

    it.each([
        [{type: 'RANDOM_FOREST'}, ['regression', 'probability_1', 'probability_2']],
        [{type: 'SVM', svmType: 'C_SVC'}, ['probability_1', 'probability_2']],
        [{type: 'SVM', svmType: 'NU_SVC'}, ['probability_1', 'probability_2']],
        [{type: 'SVM', svmType: 'ONE_CLASS'}, []],
        [{type: 'MINIMUM_DISTANCE'}, []]
    ])('are, for %j, %j', (classifier, outputs) => {
        expect(offered({classifier, classifierType: classifier.type})).toEqual(outputs)
    })

    it('are those of the type alone where only the type is known, an SVM taken as the default C_SVC', () => {
        expect(offered({classifierType: 'SVM'})).toEqual(['probability_1', 'probability_2'])
    })

    it('are offered as choices by what the configuration supports', () => {
        const options = groupedBandOptions({
            dataSets: ['SENTINEL_1'],
            classification: {classifier: {type: 'SVM', svmType: 'ONE_CLASS'}, classifierType: 'SVM', classificationLegend: LEGEND, include: ['regression', 'probabilities']}
        })

        expect(options.at(-1)).toEqual([])
    })
})

// What a temporal consumer offers of a configured collection's images is what that collection carries, as the shared
// rule judging a chosen band settles it (collectionBands.js). Planet's choices are the established ones, all carried.
describe('the bands of the images offered of a configured collection', () => {
    const offered = (dataSets, corrections) => groupedBandOptions({dataSets, corrections}).flat().map(({value}) => value)
    const carried = (dataSets, corrections) => collectionMeasures({sources: {dataSets: toSources(dataSets)}, options: {corrections}})

    it.each([
        [['LANDSAT_8'], []],
        [['LANDSAT_8'], ['SR']],
        [['LANDSAT_8'], ['SR', 'BRDF']],
        [['SENTINEL_2'], []],
        [['SENTINEL_2'], ['SR']],
        [['SENTINEL_2'], ['SR', 'BRDF']],
        [['LANDSAT_8', 'SENTINEL_2'], []],
        [['LANDSAT_8', 'SENTINEL_2'], ['SR']],
        [['LANDSAT_8', 'SENTINEL_2'], ['SR', 'BRDF']],
        [['SENTINEL_1'], undefined]
    ])('are, over %j with corrections %j, those it carries', (dataSets, corrections) => {
        expect(offered(dataSets, corrections).sort()).toEqual(carried(dataSets, corrections).sort())
    })

    it.each(['NICFI', 'BASEMAPS', 'DAILY'])('are, over Planet %s, among those it carries', source => {
        expect(carried([source])).toEqual(expect.arrayContaining(offered([source])))
    })
})

// A choice a panel shows as made though nothing offers it - a band the collection no longer carries, or a classified
// output the Classification does not provide or is not yet known to - so it can be explained and taken back. It is
// named as the caller names it.
describe('the choices shown beside what is offered', () => {
    const OFFERED = [[{value: 'blue', label: 'blue'}], [{value: 'probability_1', label: 'Forest'}]]
    const labelOf = band => `named ${band}`

    it('add a group of each choice nothing offers, in the order chosen, named as the caller names it', () => {
        expect(withChosenBands(OFFERED, ['blue', 'regression', 'probability_1', 'swir1'], labelOf))
            .toEqual([...OFFERED, [{value: 'regression', label: 'named regression'}, {value: 'swir1', label: 'named swir1'}]])
    })

    it('add a single choice nothing offers', () => {
        expect(withChosenBands(OFFERED, 'thermal2', labelOf)).toEqual([...OFFERED, [{value: 'thermal2', label: 'named thermal2'}]])
    })

    it('show a choice while nothing is offered', () => {
        expect(withChosenBands([], ['ndvi'], labelOf)).toEqual([[{value: 'ndvi', label: 'named ndvi'}]])
    })

    it('add nothing where everything chosen is offered, or nothing is chosen', () => {
        expect(withChosenBands(OFFERED, ['blue'], labelOf)).toBe(OFFERED)
        expect(withChosenBands(OFFERED, null, labelOf)).toBe(OFFERED)
        expect(withChosenBands(OFFERED, [], labelOf)).toBe(OFFERED)
    })
})
