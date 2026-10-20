import assert from 'node:assert/strict'
import {describe, it} from 'node:test'
import {format, isDeepStrictEqual} from 'node:util'

import {readImageOutput} from '#sepal/recipe/output/readImageOutput'
import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {assertMatches} from '#sepal/testSupport/assert'

// Whether a Remapping can run, as its constraints say: each reads a band of one of its inputs, by imageId, from the bands
// that input includes. A constraint naming an input the list no longer holds, or a band its input does not include, is
// found at that constraint; the Remapping is still described, from its legend, and neither it nor a recipe whose image
// builds it can run. What an input's source holds is its description's to say, not the constraint's. Codes, statuses
// and persisted field names are literals.

describe('a Remapping whose constraint no longer resolves', () => {
    it('judges the image reference, not retained source identity, before and after reconnection', () => {
        const retained = {imageSource: 'RECIPE_REF:composite-1', operator: '<', value: -7}
        const removed = remapping([entry([{...constraint('i-gone', 'red'), ...retained}])])
        const restored = remapping([entry([{...constraint('i-1', 'red'), ...retained}])])

        assert.deepEqual(read(removed, [COMPOSITE]).readiness.findings.map(({code}) => code), ['MISSING_CONSTRAINT_INPUT'])
        assert.equal(read(restored, [COMPOSITE]).readiness.status, 'READY')
        assert.equal(read(remappingOf(REMAPPING), [restored, COMPOSITE]).readiness.status, 'READY')
    })

    for (const [_case, code, broken] of [
        ['an input since removed', 'MISSING_CONSTRAINT_INPUT', constraint('i-gone', 'red')],
        ['a band its input does not include', 'CONSTRAINT_BAND_NOT_INCLUDED', constraint('i-1', 'swir1')]
    ]) {
        it(format('reading %s is described, and cannot run, found at that constraint', _case), () => {
            const recipe = remapping([entry([constraint('i-1', 'red'), broken])])

            const result = read(recipe, [COMPOSITE])

            assert.equal(result.status, 'READY')
            assert.deepEqual(result.description.output.bands.map(({name}) => name), ['class'])
            assert.deepEqual(result.readiness, {
                status: 'NOT_READY',
                findings: [{code, path: ['model', 'legend', 'entries', 0, 'constraints', 1], recipePath: [REMAPPING]}],
                needs: {records: [], observations: []}
            })
        })
    }

    it('is found at every such constraint, in whichever entry it lies', () => {
        const recipe = remapping([
            entry([constraint('i-1', 'red')]),
            entry([constraint('i-1', 'swir1'), constraint('i-gone', 'red')])
        ])

        assert.deepEqual(read(recipe, [COMPOSITE]).readiness.findings, [
            {code: 'MISSING_CONSTRAINT_INPUT', path: ['model', 'legend', 'entries', 1, 'constraints', 1], recipePath: [REMAPPING]},
            {code: 'CONSTRAINT_BAND_NOT_INCLUDED', path: ['model', 'legend', 'entries', 1, 'constraints', 0], recipePath: [REMAPPING]}
        ])
    })

    it('keeps a Remapping of it from running, though that Remapping\'s description reads nothing of it', () => {
        const broken = remapping([entry([constraint('i-gone', 'red')])])

        const result = read(remappingOf(REMAPPING), [broken, COMPOSITE])

        assert.equal(result.status, 'READY')
        assert.deepEqual(result.readiness.findings, [
            {code: 'MISSING_CONSTRAINT_INPUT', path: ['model', 'legend', 'entries', 0, 'constraints', 0], recipePath: [OVER, REMAPPING]}
        ])
    })

    it('lets it, and a Remapping of it, run once the constraint reads a band its input includes', () => {
        const repaired = remapping([entry([constraint('i-1', 'nir')])])

        assert.equal(read(repaired, [COMPOSITE]).readiness.status, 'READY')
        assert.equal(read(remappingOf(REMAPPING), [repaired, COMPOSITE]).readiness.status, 'READY')
    })
})

describe('a Remapping whose constraints read bands its inputs include', () => {
    it('waits for an input not yet loaded, finding nothing of its constraints', () => {
        const result = read(remapping([entry([constraint('i-1', 'red')])]), [])

        assert.deepEqual(result.readiness, {status: 'NEEDS_EVIDENCE', findings: [], needs: {records: [COMPOSITE.id], observations: []}})
    })

    // That the asset no longer holds the band is its source's to establish, not a constraint reading what the input does
    // not include.
    it('does not find a band its asset no longer holds to be one its input does not include', () => {
        const recipe = remapping([entry([constraint('i-2', 'elevation')])], [assetInput('i-2', DEM, ['elevation'])])

        const result = read(recipe, [], {[DEM]: ['slope']})

        assert.ok(!(result.readiness.findings).some(actual => Object.entries({code: 'CONSTRAINT_BAND_NOT_INCLUDED'}).every(([key, value]) => isDeepStrictEqual(actual?.[key], value))))
    })
})

describe('a constraint reading a band absent from its current source description', () => {
    it('keeps the class description but blocks this Remapping and its dependent, locating the used input band', () => {
        const recipe = remapping([entry([constraint('i-2', 'elevation')])], [assetInput('i-2', DEM, ['elevation', 'slope'])])
        for (const root of [recipe, remappingOf(recipe.id)]) {
            const result = read(root, [recipe], {[DEM]: ['slope']})
            assert.deepEqual(result.description.output.bands.map(({name}) => name), ['class'])
            assert.equal(result.readiness.status, 'NOT_READY')
            assert.deepEqual(result.readiness.findings, [{
                code: 'MISSING_INPUT_BAND', path: ['model', 'inputImagery', 'images', 0, 'includedBands', 0],
                recipePath: root.id === recipe.id ? [REMAPPING] : [OVER, REMAPPING]
            }])
            assert.equal(read(root, [recipe], {[DEM]: ['elevation', 'slope']}).readiness.status, 'READY')
        }
    })

    it('also follows an upstream recipe removing and restoring its output band', () => {
        const upstream = name => ({id: 'stack', type: 'STACK', model: {
            inputImagery: {images: [assetInput('s', DEM, ['elevation'])]},
            bandNames: {bandNames: [{imageId: 's', bands: [{originalName: 'elevation', outputName: name}]}]}
        }})
        const recipe = remapping([entry([constraint('i-2', 'red')])], [
            {...assetInput('i-2', 'stack', ['red']), type: 'RECIPE_REF'}
        ])
        for (const root of [recipe, remappingOf(recipe.id)]) {
            const missing = read(root, [recipe, upstream('nir')], {[DEM]: ['elevation']})
            assert.equal(missing.status, 'READY')
            assertMatches(missing.readiness.findings, [{
                code: 'MISSING_INPUT_BAND'
            }])
            assert.equal(read(root, [recipe, upstream('red')], {[DEM]: ['elevation']}).readiness.status, 'READY')
        }
    })

    it('does not diagnose pending evidence, unused selections, or repeat broken configuration references', () => {
        const recipe = remapping([entry([constraint('i-2', 'elevation')])], [assetInput('i-2', DEM, ['elevation', 'slope'])])
        assertMatches(read(recipe, []).readiness, {status: 'NEEDS_EVIDENCE', findings: []})
        assert.equal(read(recipe, [], {[DEM]: ['elevation']}).readiness.status, 'READY')
        const invalid = remapping([entry([constraint('gone', 'red'), constraint('i-2', 'red')])], recipe.model.inputImagery.images)
        assert.deepEqual(read(invalid, [], {[DEM]: ['slope']}).readiness.findings.map(({code}) => code), ['MISSING_CONSTRAINT_INPUT', 'CONSTRAINT_BAND_NOT_INCLUDED'])
    })
})

const REMAPPING = 'remapping-1'
const OVER = 'remapping-2'
const DEM = 'users/x/dem'

// A Landsat composite, described from its configuration.
const COMPOSITE = {
    id: 'composite-1',
    type: 'MOSAIC',
    model: {sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100}, compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}}
}

function constraint(image, band) {
    return {image, band, operator: '>', value: 0.3}
}

const entry = constraints => ({value: 1, booleanOperator: 'and', constraints})

const compositeInput = {imageId: 'i-1', type: 'RECIPE_REF', id: COMPOSITE.id, includedBands: [{band: 'red'}, {band: 'nir'}]}

const assetInput = (imageId, id, bands) => ({imageId, type: 'ASSET', id, includedBands: bands.map(band => ({band}))})

// Its single input including red and nir of the composite.
const remapping = (entries, images = [compositeInput]) => ({
    id: REMAPPING,
    type: 'REMAPPING',
    model: {inputImagery: {images}, legend: {entries}}
})

// A Remapping of another recipe's class 1.
const remappingOf = id => ({
    id: OVER,
    type: 'REMAPPING',
    model: {
        inputImagery: {images: [{imageId: 'r-1', type: 'RECIPE_REF', id, includedBands: [{band: 'class'}]}]},
        legend: {entries: [{value: 1, constraints: [{image: 'r-1', band: 'class', operator: '=', value: 1}]}]}
    }
})

// What the session holds: these records, and the bands held for each asset.
const read = (root, records, bandsByAsset = {}) => readImageOutput({
    graph: buildRecipeDependencyGraph({rootRecipe: root, recipesById: new Map([root, ...records].map(recipe => [recipe.id, recipe]))}),
    declarationFor: ({type}) => recipeType(type)?.imageOutput,
    readinessFor: ({type}) => recipeType(type),
    observationFor: ({type, id}) => type === 'ASSET' && bandsByAsset[id]
        ? {bands: bandsByAsset[id].map(name => ({name, dataType: {arrayDimensions: 0}})), evidence: []}
        : undefined
})
