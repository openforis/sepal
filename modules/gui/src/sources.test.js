import {describe, expect, it, vi} from 'vitest'

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))

const {getAvailableBands, groupedBandOptions, withChosenClassifiedOutputs} = await import('./sources')

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

// A choice a panel shows as made though nothing offers it: a classified output, which can be explained and taken back,
// and never a band of the images themselves that is no longer offered.
describe('the choices shown beside what is offered', () => {
    const OFFERED = [[{value: 'blue', label: 'blue'}], [{value: 'probability_1', label: 'Forest'}]]

    it('add a group for each classified output chosen that nothing offers', () => {
        expect(withChosenClassifiedOutputs(OFFERED, ['blue', 'regression', 'probability_1']))
            .toEqual([...OFFERED, [{value: 'regression', label: 'regression'}]])
    })

    it('add nothing for a band of the images themselves that is no longer offered, or for no choice', () => {
        expect(withChosenClassifiedOutputs(OFFERED, ['swir1'])).toBe(OFFERED)
        expect(withChosenClassifiedOutputs(OFFERED, null)).toBe(OFFERED)
    })
})
