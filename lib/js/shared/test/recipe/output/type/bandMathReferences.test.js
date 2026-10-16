import {throwError} from 'rxjs'

import {settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'

// The same applied calculation rule must hold the recipe and an output whose description never reads its calculations.
// Observations deliberately succeed: they cannot establish that a configuration reference is valid.
describe('Band Math calculation references in execution readiness', () => {
    it.each([
        ['removed input in an expression', expression('iGone.red * 2'), {code: 'UNKNOWN_VARIABLE', variable: 'iGone'}],
        ['removed input in a reducer', reducer('gone', 'iGone', 'red'), {code: 'MISSING_IMAGE', variable: 'iGone', band: 'red'}],
        ['removed calculation', expression('gone.result'), {code: 'UNKNOWN_VARIABLE', variable: 'gone'}],
        ['unselected input band', expression('i1.nir'), {code: 'UNKNOWN_BAND', variable: 'i1', band: 'nir'}],
        ['unselected reducer band', reducer('input', 'i1', 'nir'), {code: 'UNKNOWN_BAND', variable: 'i1', band: 'nir'}],
        ['self reference', expression('c1.result'), {code: 'SELF_REFERENCE', variable: 'c1'}],
        ['self reference in a reducer', reducer('calc', 'c1', 'result'), {code: 'SELF_REFERENCE', variable: 'c1'}],
        ['invalid argument count', expression('max(i1.red)'), {code: 'INVALID_ARG_COUNT', argCount: 1, expectedArgCount: 2}],
        ['syntax error', expression('(i1.red'), {code: 'SYNTAX_ERROR'}]
    ])('blocks %s, preserving descriptions and attributing the original calculation downstream', (_case, calculation, problem) => {
        const math = bandMath([calculation])
        const own = read(math)
        const over = read(remapping(), [math])
        expect(own.status).toBe('READY')
        expect(over.description.output.bands.map(({name}) => name)).toEqual(['class'])
        expect(own.readiness).toMatchObject({status: 'NOT_READY', findings: [{
            code: 'INVALID_CALCULATION', path: ['model', 'calculations', 'calculations', 0], recipePath: ['math'], problems: [problem]
        }]})
        expect(over.readiness.findings).toEqual(own.readiness.findings.map(finding => ({...finding, recipePath: ['over', 'math']})))
    })

    it('rejects forward references and a cycle, without accusing the dependent calculation of the original problem', () => {
        const first = expression('c2.result')
        const second = {...expression('c1.result'), imageId: 'calc2', name: 'c2'}
        const result = read(bandMath([first, second]))
        expect(result.readiness.findings).toEqual([{
            code: 'INVALID_CALCULATION', path: ['model', 'calculations', 'calculations', 0], recipePath: ['math'],
            problems: [{code: 'FORWARD_REFERENCE', variable: 'c2', item: 'calc2'}]
        }])
    })

    it('checks reducer ordering and configured calculation bands', () => {
        const first = reducer('calc2', 'c2', 'result')
        const second = {...reducer('calc', 'c1', 'gone'), imageId: 'calc2', name: 'c2'}
        expect(read(bandMath([first, second])).readiness.findings.map(({problems}) => problems)).toEqual([
            [{code: 'FORWARD_REFERENCE', variable: 'c2', item: 'calc2'}],
            [{code: 'UNKNOWN_BAND', variable: 'c1', band: 'gone'}]
        ])
    })

    it('keeps the existing rule for incompatible whole-image band counts', () => {
        const math = bandMath([expression('i1 + i2')])
        math.model.inputImagery.images[0].includedBands.push({id: 'nir', name: 'nir'})
        math.model.inputImagery.images.push({imageId: 'second', name: 'i2', type: 'ASSET', id: 'users/x/other', includedBands: ['a', 'b', 'c'].map(name => ({id: name, name}))})
        expect(read(math).readiness.findings).toContainEqual(expect.objectContaining({problems: [
            {code: 'INVALID_BAND_COUNT', imageName: 'i2', expectedBandCount: 2, bandCount: 3}
        ]}))
    })

    it('reports broken configuration while evidence is pending, without inventing missing references for configured inputs', () => {
        const broken = bandMath([expression('missing.red')])
        expect(read(broken, [], false).readiness).toMatchObject({status: 'NOT_READY', findings: [expect.objectContaining({code: 'INVALID_CALCULATION'})]})
        expect(read(bandMath(), [], false).readiness).toMatchObject({status: 'NEEDS_EVIDENCE', findings: []})
    })

    it.each([false, true])('failed source evidence cannot fabricate a reference finding, broken=%s', async broken => {
        const math = bandMath([expression(broken ? 'missing.red' : 'i1.red')])
        const graph = graphOf(remapping(), [math])
        const result = await new Promise((resolve, reject) => settledImageOutput$({
            graph,
            declarationFor,
            readinessFor,
            observeBands$: () => throwError(() => new Error('source unavailable'))
        }).subscribe({next: resolve, error: reject}))
        expect(result.readiness.findings.filter(({code}) => code === 'INVALID_CALCULATION')).toHaveLength(broken ? 1 : 0)
    })

    it('restores the whole chain when the originating calculation is repaired', () => {
        const broken = bandMath([expression('missing.red'), {...expression('c1.result * 2'), imageId: 'calc2', name: 'c2'}])
        expect(read(remapping(), [broken]).readiness.status).toBe('NOT_READY')
        const repaired = bandMath([expression('i1.red'), broken.model.calculations.calculations[1]])
        expect(read(repaired).readiness.status).toBe('READY')
        expect(read(remapping(), [repaired]).readiness.status).toBe('READY')
    })
})

function expression(expression) {
    return {imageId: 'calc', name: 'c1', type: 'EXPRESSION', expression, includedBands: [{id: 'result', name: 'result'}]}
}
function reducer(imageId, imageName, name) {
    return {...expression(''), type: 'FUNCTION', reducer: 'mean', usedBands: [{imageId, imageName, name}]}
}
const bandMath = (calculations = [expression('i1.red')]) => ({id: 'math', type: 'BAND_MATH', model: {
    inputImagery: {images: [{imageId: 'input', name: 'i1', type: 'ASSET', id: 'users/x/a', includedBands: [{id: 'red', name: 'red'}]}]},
    calculations: {calculations},
    outputBands: {outputImages: [{imageId: 'calc', outputBands: [{name: 'result', outputName: 'out'}]}]}
}})
const remapping = () => ({id: 'over', type: 'REMAPPING', model: {
    inputImagery: {images: [{imageId: 'math-input', type: 'RECIPE_REF', id: 'math', includedBands: [{band: 'out'}]}]},
    legend: {entries: [{id: 'class', value: 1, label: 'Class'}]}
}})
const graphOf = (recipe, records = []) => buildRecipeDependencyGraph({rootRecipe: recipe, recipesById: new Map(records.map(recipe => [recipe.id, recipe]))})
const declarationFor = ({type}) => recipeType(type)?.imageOutput
const readinessFor = ({type}) => recipeType(type)
const read = (recipe, records = [], observed = true) => readImageOutput({
    graph: graphOf(recipe, records), declarationFor, readinessFor,
    observationFor: ({type, id}) => observed ? {bands: (type === 'ASSET' ? id === 'users/x/other' ? ['a', 'b', 'c'] : ['red', 'nir'] : ['out'])
        .map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []} : undefined
})
