import {describe, expect, it, vi} from 'vitest'

// Whether a Classification's layer can classify (canClassify): a classifier that is trained needs training data - points
// stored in a data set, or a recipe to read them from - and while points are being collected, points of two classes. A
// supplied decision tree is used as given.

vi.mock('~/translate', () => ({msg: key => key}))

const {canClassify} = await import('./classificationRecipe')

describe('a Classification layer', () => {
    it('cannot classify by a trained classifier without training data', () => {
        expect(canClassify(classification({dataSets: [collected([])]}))).toBe(false)
    })

    it('classifies by a supplied decision tree without training data', () => {
        expect(canClassify(classification({dataSets: [collected([])], classifier: 'DECISION_TREE'}))).toBe(true)
    })

    it('classifies once a data set stores a point, or reads them from a recipe', () => {
        expect(canClassify(classification({dataSets: [collected([]), {type: 'CSV_UPLOAD', referenceData: [point(1)]}]}))).toBe(true)
        expect(canClassify(classification({dataSets: [collected([]), {type: 'RECIPE', recipe: 'trained-1'}]}))).toBe(true)
    })

    it('while points are collected, classifies once two classes have points', () => {
        const collecting = countPerClass => classification({dataSets: [collected([point(1)])], collect: {countPerClass}})

        expect(canClassify(collecting({1: 3}))).toBe(false)
        expect(canClassify(collecting({1: 3, 2: 1}))).toBe(true)
    })
})

const point = value => ({x: 0.5, y: 0.5, class: value})

const collected = referenceData => ({dataSetId: 'collected', type: 'COLLECTED', referenceData})

const classification = ({dataSets, classifier = 'RANDOM_FOREST', collect}) => ({
    id: 'classification-1',
    type: 'CLASSIFICATION',
    model: {trainingData: {dataSets}, classifier: {type: classifier}},
    ui: collect ? {collect} : {}
})
