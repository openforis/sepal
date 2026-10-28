import assert from 'node:assert/strict'
import {describe, it} from 'node:test'

import {imageOutputDescription} from '#sepal/recipe/output/imageOutput'

const recipeReference = id => ({type: 'RECIPE_REF', id})
const assetReference = id => ({type: 'ASSET', id})
const SCALAR = {arrayDimensions: 0}

const band = (name, pyramidingPolicy, dataType = SCALAR) => ({
    name,
    dataType,
    ...(pyramidingPolicy !== undefined && {pyramidingPolicy})
})

const describeOutput = (overrides = {}) => imageOutputDescription({
    executionReference: recipeReference('outer-recipe'),
    bands: [band('value', 'mean')],
    ...overrides
})

const validResult = ({
    executionReference = recipeReference('outer-recipe'),
    bands = [band('value', 'mean')],
    evidence = []
} = {}) => ({
    description: {
        executionReference,
        output: {
            kind: 'IMAGE',
            bands
        },
        evidence
    },
    diagnostics: []
})

const invalidResult = (...diagnostics) => ({
    description: null,
    diagnostics
})

describe('imageOutputDescription', () => {
    it('describes ordered sample bands for the selected recipe execution reference', () => {
        const executionReference = recipeReference('selected-outer-recipe')
        const bands = [
            band('red_coefs', 'sample'),
            band('nir_coefs', 'sample'),
            band('tBreak', 'sample')
        ]

        assert.deepEqual(
            describeOutput({executionReference, bands}),
            validResult({executionReference, bands})
        )
    })

    it('accepts an asset as the outer execution reference', () => {
        const executionReference = assetReference('projects/project/assets/source-image')
        const bands = [band('elevation', 'mean')]

        assert.deepEqual(
            describeOutput({executionReference, bands}),
            validResult({executionReference, bands})
        )
    })

    it('constructs only the canonical reference and band fields owned by the contract', () => {
        const executionReference = {
            ...recipeReference('selected-outer-recipe'),
            title: 'copied source title'
        }
        const bands = [{
            ...band('elevation', 'mean', {arrayDimensions: 0}),
            copiedVisualization: {min: 0, max: 1}
        }]

        assert.deepEqual(describeOutput({executionReference, bands}), validResult({
            executionReference: recipeReference('selected-outer-recipe'),
            bands: [band('elevation', 'mean', {arrayDimensions: 0})]
        }))
    })

    it('preserves array dimensionality independently of an optional pyramiding policy', () => {
        const bands = [
            band('array', 'sample', {arrayDimensions: 2}),
            band('scalar', undefined, {arrayDimensions: 0}),
            band('unknown')
        ]

        assert.deepEqual(describeOutput({bands}), validResult({bands}))
    })

    it('preserves mixed policies in band order and keeps each policy associated with its band', () => {
        const bands = [
            band('temperature', 'mean'),
            band('land-cover', 'mode'),
            band('segments', 'sample')
        ]

        assert.deepEqual(describeOutput({bands}), validResult({bands}))
    })

    it('carries an unrecognized non-blank policy without closing the shared vocabulary', () => {
        const bands = [band('synthetic', 'future-policy')]

        assert.deepEqual(describeOutput({bands}), validResult({bands}))
    })

    it('carries evidence without replacing the outer execution reference', () => {
        const executionReference = recipeReference('selected-outer-recipe')
        const evidence = [{reference: recipeReference('observed-inner-recipe')}]

        assert.deepEqual(
            describeOutput({executionReference, evidence}),
            validResult({executionReference, evidence})
        )
    })

    for (const [label, executionReference, code, path] of [
        ['an absent reference', undefined, 'INCOMPLETE_REFERENCE', ['executionReference']],
        ['a reference with no type', {id: 'outer-recipe'}, 'INCOMPLETE_REFERENCE', ['executionReference', 'type']],
        ['a reference with a blank type', {type: '   ', id: 'outer-recipe'}, 'INCOMPLETE_REFERENCE', ['executionReference', 'type']],
        ['a reference with no id', {type: 'RECIPE_REF'}, 'INCOMPLETE_REFERENCE', ['executionReference', 'id']],
        ['a reference with a blank id', {type: 'ASSET', id: '   '}, 'INCOMPLETE_REFERENCE', ['executionReference', 'id']],
        ['a non-object reference', 'outer-recipe', 'MALFORMED_REFERENCE', ['executionReference']],
        ['an array reference', ['RECIPE_REF', 'outer-recipe'], 'MALFORMED_REFERENCE', ['executionReference']],
        ['a reference with a non-string id', {type: 'RECIPE_REF', id: 12}, 'MALFORMED_REFERENCE', ['executionReference', 'id']],
        ['an unknown reference type', {type: 'UNKNOWN', id: 'outer-recipe'}, 'MALFORMED_REFERENCE', ['executionReference', 'type']]
    ]) {
        it(`diagnoses ${label}`, () => {
            assert.deepEqual(describeOutput({executionReference}), invalidResult({code, path}))
        })
    }

    for (const [labelName, bands, code] of [
        ['an absent band list', undefined, 'INCOMPLETE_IMAGE_OUTPUT'],
        ['a non-array band list', {red: 'mean'}, 'MALFORMED_IMAGE_OUTPUT']
    ]) {
        it(`diagnoses ${labelName}`, () => {
            assert.deepEqual(describeOutput({bands}), invalidResult({
                code,
                path: ['bands']
            }))
        })
    }

    for (const [labelName, malformedBand] of [
        ['a string', 'nir'],
        ['an array', ['nir', 'mean']]
    ]) {
        it(`diagnoses ${labelName} used as a band descriptor`, () => {
            assert.deepEqual(
                describeOutput({bands: [band('red', 'mean'), malformedBand]}),
                invalidResult({
                    code: 'MALFORMED_IMAGE_OUTPUT',
                    path: ['bands', 1]
                })
            )
        })
    }

    for (const [labelName, name] of [
        ['an absent name', undefined],
        ['an empty name', ''],
        ['a whitespace-only name', '   ']
    ]) {
        it(`diagnoses ${labelName}`, () => {
            assert.deepEqual(describeOutput({bands: [band(name, 'mean')]}), invalidResult({
                code: 'INCOMPLETE_IMAGE_OUTPUT',
                path: ['bands', 0, 'name']
            }))
        })
    }

    // What a stored value means travels with its band. The same fact stated without an offset is the same
    // fact, so a description carries one form of it.
    it('carries a band\'s value encoding, completing an omitted offset', () => {
        const {description} = describeOutput({bands: [{name: 'red', dataType: SCALAR, encoding: {scale: 0.0001, unit: '1'}}]})

        assert.deepEqual(
            description.output.bands,
            [{name: 'red', dataType: SCALAR, encoding: {scale: 0.0001, offset: 0, unit: '1'}}]
        )
    })

    it('carries a non-zero offset as stated', () => {
        const encoding = {scale: 0.0000275, offset: -0.2, unit: '1'}

        const {description} = describeOutput({bands: [{name: 'red', dataType: SCALAR, encoding}]})

        assert.deepEqual(description.output.bands[0].encoding, encoding)
    })

    // A producer that states an encoding it cannot mean has a defect, not missing metadata.
    for (const [scenario, encoding] of [
        ['a zero scale', {scale: 0}],
        ['a missing scale', {offset: 0}],
        ['a non-finite offset', {scale: 1, offset: Infinity}],
        ['a blank unit', {scale: 1, unit: ' '}]
    ]) {
        it(`diagnoses an encoding with ${scenario}`, () => {
            assert.deepEqual(
                describeOutput({bands: [{name: 'red', dataType: SCALAR, encoding}]}),
                invalidResult({
                    code: 'MALFORMED_IMAGE_OUTPUT',
                    path: ['bands', 0, 'encoding']
                })
            )
        })
    }

    it('diagnoses a non-string band name', () => {
        assert.deepEqual(describeOutput({bands: [band(12, 'mean')]}), invalidResult({
            code: 'MALFORMED_IMAGE_OUTPUT',
            path: ['bands', 0, 'name']
        }))
    })

    it('diagnoses a duplicate name at the duplicate band', () => {
        assert.deepEqual(
            describeOutput({bands: [band('red', 'mean'), band('red', 'sample')]}),
            invalidResult({
                code: 'DUPLICATE_BAND_NAME',
                path: ['bands', 1, 'name']
            })
        )
    })

    for (const [labelName, pyramidingPolicy, code] of [
        ['a blank pyramiding policy', '   ', 'INCOMPLETE_IMAGE_OUTPUT'],
        ['a non-string pyramiding policy', {name: 'mean'}, 'MALFORMED_IMAGE_OUTPUT']
    ]) {
        it(`diagnoses ${labelName}`, () => {
            assert.deepEqual(describeOutput({bands: [band('red', pyramidingPolicy)]}), invalidResult({
                code,
                path: ['bands', 0, 'pyramidingPolicy']
            }))
        })
    }

    it('accepts an absent pyramiding policy as unresolved export authority', () => {
        const bands = [band('red')]

        assert.deepEqual(describeOutput({bands}), validResult({bands}))
    })

    for (const [labelName, dataType, suffix] of [
        ['null', null, ['dataType']],
        ['an array', [1], ['dataType']],
        ['a string dimension count', {arrayDimensions: '1'}, ['dataType', 'arrayDimensions']],
        ['a negative dimension count', {arrayDimensions: -1}, ['dataType', 'arrayDimensions']],
        ['a fractional dimension count', {arrayDimensions: 1.5}, ['dataType', 'arrayDimensions']]
    ]) {
        it(`diagnoses ${labelName} as malformed normalized data type evidence`, () => {
            assert.deepEqual(
                describeOutput({bands: [band('red', 'sample', dataType)]}),
                invalidResult({
                    code: 'MALFORMED_IMAGE_OUTPUT',
                    path: ['bands', 0, ...suffix]
                })
            )
        })
    }

    // Dimensionality is never left unknown in a description: declared, inherited or observed, or not described.
    it('diagnoses a band that states no dimensionality as incomplete', () => {
        assert.deepEqual(
            describeOutput({bands: [{name: 'red', pyramidingPolicy: 'mean'}]}),
            invalidResult({
                code: 'INCOMPLETE_IMAGE_OUTPUT',
                path: ['bands', 0, 'dataType']
            })
        )
    })

    it('diagnoses a missing normalized dimension count as incomplete evidence', () => {
        assert.deepEqual(describeOutput({bands: [band('red', 'sample', {})]}), invalidResult({
            code: 'INCOMPLETE_IMAGE_OUTPUT',
            path: ['bands', 0, 'dataType', 'arrayDimensions']
        }))
    })

    it('diagnoses a malformed evidence collection', () => {
        assert.deepEqual(describeOutput({evidence: 'runtime observation'}), invalidResult({
            code: 'MALFORMED_IMAGE_OUTPUT',
            path: ['evidence']
        }))
    })

    describe('diagnostic accumulation', () => {
        it('reports both canonical reference fields when both are absent', () => {
            assert.deepEqual(describeOutput({executionReference: {}}), invalidResult(
                {code: 'INCOMPLETE_REFERENCE', path: ['executionReference', 'type']},
                {code: 'INCOMPLETE_REFERENCE', path: ['executionReference', 'id']}
            ))
        })

        it('reports malformed execution and evidence siblings together', () => {
            assert.deepEqual(describeOutput({
                executionReference: ['RECIPE_REF', 'outer-recipe'],
                evidence: 'runtime observation'
            }), invalidResult(
                {code: 'MALFORMED_REFERENCE', path: ['executionReference']},
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['evidence']}
            ))
        })

        it('reports two malformed band entries in array order', () => {
            assert.deepEqual(describeOutput({bands: ['red', ['nir', 'mean']]}), invalidResult(
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['bands', 0]},
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['bands', 1]}
            ))
        })

        it('reports the required name and dimensionality when optional output authority is absent too', () => {
            assert.deepEqual(describeOutput({bands: [{}]}), invalidResult(
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'name']},
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'dataType']}
            ))
        })

        it('reports a duplicate name before a later malformed band', () => {
            assert.deepEqual(describeOutput({bands: [
                band('red', 'mean'),
                band('red', 'sample'),
                ['nir', 'mean']
            ]}), invalidResult(
                {code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name']},
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['bands', 2]}
            ))
        })

        it('orders all diagnostics by reference, bands and descriptor fields, then evidence', () => {
            assert.deepEqual(imageOutputDescription({
                executionReference: {type: 'UNKNOWN', id: 'outer-recipe'},
                bands: [
                    {},
                    band('red', 'mean'),
                    band('red', 'sample'),
                    'nir'
                ],
                evidence: 'runtime observation'
            }), invalidResult(
                {code: 'MALFORMED_REFERENCE', path: ['executionReference', 'type']},
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'name']},
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'dataType']},
                {code: 'DUPLICATE_BAND_NAME', path: ['bands', 2, 'name']},
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['bands', 3]},
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['evidence']}
            ))
        })
    })

    it('returns independent mutable structures for independent calls', () => {
        const first = describeOutput({evidence: [{observation: 1}]})
        const second = describeOutput({evidence: [{observation: 1}]})

        assert.notEqual(first, second)
        assert.notEqual(first.description, second.description)
        assert.notEqual(
            first.description.executionReference,
            second.description.executionReference
        )
        assert.notEqual(first.description.output, second.description.output)
        assert.notEqual(first.description.output.bands, second.description.output.bands)
        assert.notEqual(first.description.output.bands[0], second.description.output.bands[0])
        assert.notEqual(first.description.evidence, second.description.evidence)
        assert.notEqual(first.diagnostics, second.diagnostics)
    })

    it('creates independent default evidence arrays for independent calls', () => {
        const first = describeOutput()
        const second = describeOutput()

        assert.deepEqual(first.description.evidence, [])
        assert.deepEqual(second.description.evidence, [])
        assert.notEqual(first.description.evidence, second.description.evidence)
    })

    it('owns returned structures without cloning opaque evidence entries', () => {
        const executionReference = recipeReference('selected-outer-recipe')
        const bands = [band('red', 'mean', {arrayDimensions: 1})]
        const evidence = [{observation: 1}]
        const input = {executionReference, bands, evidence}
        const before = structuredClone(input)
        const {description} = imageOutputDescription(input)

        assert.notEqual(description.executionReference, executionReference)
        assert.notEqual(description.output.bands, bands)
        assert.notEqual(description.output.bands[0], bands[0])
        assert.deepEqual(description.output.bands[0].dataType, {arrayDimensions: 1})
        assert.notEqual(description.output.bands[0].dataType, bands[0].dataType)
        assert.notEqual(description.evidence, evidence)
        assert.equal(description.evidence[0], evidence[0])

        description.executionReference.id = 'changed-recipe'
        description.output.bands[0].name = 'changed-band'
        description.output.bands[0].dataType.arrayDimensions = 9
        description.output.bands.push(band('added-band', 'sample'))
        description.evidence.push({observation: 2})

        assert.deepEqual(input, before)
    })

    it('represents an explicitly empty band schema without a diagnosis', () => {
        assert.deepEqual(describeOutput({bands: []}), validResult({bands: []}))
    })
})
