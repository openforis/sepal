import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {format, isDeepStrictEqual} from 'node:util'

import {throwError} from 'rxjs'

import {settledImageOutput$} from '#sepal/recipe/output/observeImageOutput'
import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {assertMatches} from '#sepal/testSupport/assert'

// The same applied calculation rule must hold the recipe and an output whose description never reads its calculations.
// Observations deliberately succeed: they cannot establish that a configuration reference is valid.
describe('Band Math calculation references in execution readiness', () => {
    for (const [_case, calculation, problem] of [
        ['removed input in an expression', expression('iGone.red * 2'), {code: 'UNKNOWN_VARIABLE', variable: 'iGone'}],
        ['removed input in a reducer', reducer('gone', 'iGone', 'red'), {code: 'MISSING_IMAGE', variable: 'iGone', band: 'red'}],
        ['removed calculation', expression('gone.result'), {code: 'UNKNOWN_VARIABLE', variable: 'gone'}],
        ['unselected input band', expression('i1.nir'), {code: 'UNKNOWN_BAND', variable: 'i1', band: 'nir'}],
        ['unselected reducer band', reducer('input', 'i1', 'nir'), {code: 'UNKNOWN_BAND', variable: 'i1', band: 'nir'}],
        ['self reference', expression('c1.result'), {code: 'SELF_REFERENCE', variable: 'c1'}],
        ['self reference in a reducer', reducer('calc', 'c1', 'result'), {code: 'SELF_REFERENCE', variable: 'c1'}],
        ['invalid argument count', expression('max(i1.red)'), {code: 'INVALID_ARG_COUNT', argCount: 1, expectedArgCount: 2}],
        ['syntax error', expression('(i1.red'), {code: 'SYNTAX_ERROR'}]
    ]) {
        it(format('blocks %s, preserving descriptions and attributing the original calculation downstream', _case), () => {
            const math = bandMath([calculation])
            const own = read(math)
            const over = read(remapping(), [math])
            assert.equal(own.status, 'READY')
            assert.deepEqual(over.description.output.bands.map(({name}) => name), ['class'])
            assertMatches(own.readiness, {status: 'NOT_READY', findings: [{
                code: 'INVALID_CALCULATION', path: ['model', 'calculations', 'calculations', 0], recipePath: ['math'], problems: [problem]
            }]})
            assert.deepEqual(over.readiness.findings, own.readiness.findings.map(finding => ({...finding, recipePath: ['over', 'math']})))
        })
    }

    it('rejects forward references and a cycle, without accusing the dependent calculation of the original problem', () => {
        const first = expression('c2.result')
        const second = {...expression('c1.result'), imageId: 'calc2', name: 'c2'}
        const result = read(bandMath([first, second]))
        assert.deepEqual(result.readiness.findings, [{
            code: 'INVALID_CALCULATION', path: ['model', 'calculations', 'calculations', 0], recipePath: ['math'],
            problems: [{code: 'FORWARD_REFERENCE', variable: 'c2', item: 'calc2'}]
        }])
    })

    it('checks reducer ordering and configured calculation bands', () => {
        const first = reducer('calc2', 'c2', 'result')
        const second = {...reducer('calc', 'c1', 'gone'), imageId: 'calc2', name: 'c2'}
        assert.deepEqual(read(bandMath([first, second])).readiness.findings.map(({problems}) => problems), [
            [{code: 'FORWARD_REFERENCE', variable: 'c2', item: 'calc2'}],
            [{code: 'UNKNOWN_BAND', variable: 'c1', band: 'gone'}]
        ])
    })

    it('keeps the existing rule for incompatible whole-image band counts', () => {
        const math = bandMath([expression('i1 + i2')])
        math.model.inputImagery.images[0].includedBands.push({id: 'nir', name: 'nir'})
        math.model.inputImagery.images.push({imageId: 'second', name: 'i2', type: 'ASSET', id: 'users/x/other', includedBands: ['a', 'b', 'c'].map(name => ({id: name, name}))})
        assert.ok((read(math).readiness.findings).some(actual => Object.entries({problems: [
            {code: 'INVALID_BAND_COUNT', imageName: 'i2', expectedBandCount: 2, bandCount: 3}
        ]}).every(([key, value]) => isDeepStrictEqual(actual?.[key], value))))
    })

    it('reports broken configuration while evidence is pending, without inventing missing references for configured inputs', () => {
        const broken = bandMath([expression('missing.red')])
        assertMatches(read(broken, [], false).readiness, {status: 'NOT_READY', findings: [{
            code: 'INVALID_CALCULATION'
        }]})
        assertMatches(read(bandMath(), [], false).readiness, {status: 'NEEDS_EVIDENCE', findings: []})
    })

    for (const broken of [false, true]) {
        it(format('failed source evidence cannot fabricate a reference finding, broken=%s', broken), async () => {
            const math = bandMath([expression(broken ? 'missing.red' : 'i1.red')])
            const graph = graphOf(remapping(), [math])
            const result = await new Promise((resolve, reject) => settledImageOutput$({
                graph,
                declarationFor,
                readinessFor,
                observeBands$: () => throwError(() => new Error('source unavailable'))
            }).subscribe({next: resolve, error: reject}))
            assert.equal((result.readiness.findings.filter(({code}) => code === 'INVALID_CALCULATION')).length, broken ? 1 : 0)
        })
    }

    it('restores the whole chain when the originating calculation is repaired', () => {
        const broken = bandMath([expression('missing.red'), {...expression('c1.result * 2'), imageId: 'calc2', name: 'c2'}])
        assert.equal(read(remapping(), [broken]).readiness.status, 'NOT_READY')
        const repaired = bandMath([expression('i1.red'), broken.model.calculations.calculations[1]])
        assert.equal(read(repaired).readiness.status, 'READY')
        assert.equal(read(remapping(), [repaired]).readiness.status, 'READY')
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
