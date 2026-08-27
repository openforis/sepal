import {imageOutputDescription} from '#sepal/recipe/output/imageOutput'

const recipeReference = id => ({type: 'RECIPE_REF', id})
const assetReference = id => ({type: 'ASSET', id})
const band = (name, pyramidingPolicy) => ({name, pyramidingPolicy})

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

        expect(describeOutput({executionReference, bands})).toEqual(validResult({executionReference, bands}))
    })

    it('accepts an asset as the outer execution reference', () => {
        const executionReference = assetReference('projects/project/assets/source-image')
        const bands = [band('elevation', 'mean')]

        expect(describeOutput({executionReference, bands})).toEqual(validResult({executionReference, bands}))
    })

    it('constructs only the canonical reference and band fields owned by the contract', () => {
        const executionReference = {
            ...recipeReference('selected-outer-recipe'),
            title: 'copied source title'
        }
        const bands = [{
            ...band('elevation', 'mean'),
            dataType: {precision: 'float'}
        }]

        expect(describeOutput({executionReference, bands})).toEqual(validResult({
            executionReference: recipeReference('selected-outer-recipe'),
            bands: [band('elevation', 'mean')]
        }))
    })

    it('preserves mixed policies in band order and keeps each policy associated with its band', () => {
        const bands = [
            band('temperature', 'mean'),
            band('land-cover', 'mode'),
            band('segments', 'sample')
        ]

        expect(describeOutput({bands})).toEqual(validResult({bands}))
    })

    it('carries an unrecognized non-blank policy without closing the shared vocabulary', () => {
        const bands = [band('synthetic', 'future-policy')]

        expect(describeOutput({bands})).toEqual(validResult({bands}))
    })

    it('carries evidence without replacing the outer execution reference', () => {
        const executionReference = recipeReference('selected-outer-recipe')
        const evidence = [{reference: recipeReference('observed-inner-recipe')}]

        expect(describeOutput({executionReference, evidence})).toEqual(validResult({executionReference, evidence}))
    })

    it.each([
        ['an absent reference', undefined, 'INCOMPLETE_REFERENCE', ['executionReference']],
        ['a reference with no type', {id: 'outer-recipe'}, 'INCOMPLETE_REFERENCE', ['executionReference', 'type']],
        ['a reference with a blank type', {type: '   ', id: 'outer-recipe'}, 'INCOMPLETE_REFERENCE', ['executionReference', 'type']],
        ['a reference with no id', {type: 'RECIPE_REF'}, 'INCOMPLETE_REFERENCE', ['executionReference', 'id']],
        ['a reference with a blank id', {type: 'ASSET', id: '   '}, 'INCOMPLETE_REFERENCE', ['executionReference', 'id']],
        ['a non-object reference', 'outer-recipe', 'MALFORMED_REFERENCE', ['executionReference']],
        ['an array reference', ['RECIPE_REF', 'outer-recipe'], 'MALFORMED_REFERENCE', ['executionReference']],
        ['a reference with a non-string id', {type: 'RECIPE_REF', id: 12}, 'MALFORMED_REFERENCE', ['executionReference', 'id']],
        ['an unknown reference type', {type: 'UNKNOWN', id: 'outer-recipe'}, 'MALFORMED_REFERENCE', ['executionReference', 'type']]
    ])('diagnoses %s', (_label, executionReference, code, path) => {
        expect(describeOutput({executionReference})).toEqual(invalidResult({code, path}))
    })

    it.each([
        ['an absent band list', undefined, 'INCOMPLETE_IMAGE_OUTPUT'],
        ['a non-array band list', {red: 'mean'}, 'MALFORMED_IMAGE_OUTPUT']
    ])('diagnoses %s', (_label, bands, code) => {
        expect(describeOutput({bands})).toEqual(invalidResult({
            code,
            path: ['bands']
        }))
    })

    it.each([
        ['a string', 'nir'],
        ['an array', ['nir', 'mean']]
    ])('diagnoses %s used as a band descriptor', (_label, malformedBand) => {
        expect(describeOutput({bands: [band('red', 'mean'), malformedBand]})).toEqual(invalidResult({
            code: 'MALFORMED_IMAGE_OUTPUT',
            path: ['bands', 1]
        }))
    })

    it.each([
        ['an absent name', undefined],
        ['an empty name', ''],
        ['a whitespace-only name', '   ']
    ])('diagnoses %s', (_label, name) => {
        expect(describeOutput({bands: [band(name, 'mean')]})).toEqual(invalidResult({
            code: 'INCOMPLETE_IMAGE_OUTPUT',
            path: ['bands', 0, 'name']
        }))
    })

    it('diagnoses a non-string band name', () => {
        expect(describeOutput({bands: [band(12, 'mean')]})).toEqual(invalidResult({
            code: 'MALFORMED_IMAGE_OUTPUT',
            path: ['bands', 0, 'name']
        }))
    })

    it('diagnoses a duplicate name at the duplicate band', () => {
        expect(describeOutput({bands: [band('red', 'mean'), band('red', 'sample')]})).toEqual(invalidResult({
            code: 'DUPLICATE_BAND_NAME',
            path: ['bands', 1, 'name']
        }))
    })

    it.each([
        ['an absent pyramiding policy', undefined, 'INCOMPLETE_IMAGE_OUTPUT'],
        ['a blank pyramiding policy', '   ', 'INCOMPLETE_IMAGE_OUTPUT'],
        ['a non-string pyramiding policy', {name: 'mean'}, 'MALFORMED_IMAGE_OUTPUT']
    ])('diagnoses %s', (_label, pyramidingPolicy, code) => {
        expect(describeOutput({bands: [band('red', pyramidingPolicy)]})).toEqual(invalidResult({
            code,
            path: ['bands', 0, 'pyramidingPolicy']
        }))
    })

    it('diagnoses a malformed evidence collection', () => {
        expect(describeOutput({evidence: 'runtime observation'})).toEqual(invalidResult({
            code: 'MALFORMED_IMAGE_OUTPUT',
            path: ['evidence']
        }))
    })

    describe('diagnostic accumulation', () => {
        it('reports both canonical reference fields when both are absent', () => {
            expect(describeOutput({executionReference: {}})).toEqual(invalidResult(
                {code: 'INCOMPLETE_REFERENCE', path: ['executionReference', 'type']},
                {code: 'INCOMPLETE_REFERENCE', path: ['executionReference', 'id']}
            ))
        })

        it('reports malformed execution and evidence siblings together', () => {
            expect(describeOutput({
                executionReference: ['RECIPE_REF', 'outer-recipe'],
                evidence: 'runtime observation'
            })).toEqual(invalidResult(
                {code: 'MALFORMED_REFERENCE', path: ['executionReference']},
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['evidence']}
            ))
        })

        it('reports two malformed band entries in array order', () => {
            expect(describeOutput({bands: ['red', ['nir', 'mean']]})).toEqual(invalidResult(
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['bands', 0]},
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['bands', 1]}
            ))
        })

        it('reports both descriptor fields when both are absent', () => {
            expect(describeOutput({bands: [{}]})).toEqual(invalidResult(
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'name']},
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'pyramidingPolicy']}
            ))
        })

        it('reports a duplicate name before a later malformed band', () => {
            expect(describeOutput({bands: [
                band('red', 'mean'),
                band('red', 'sample'),
                ['nir', 'mean']
            ]})).toEqual(invalidResult(
                {code: 'DUPLICATE_BAND_NAME', path: ['bands', 1, 'name']},
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['bands', 2]}
            ))
        })

        it('orders all diagnostics by reference, bands and descriptor fields, then evidence', () => {
            expect(imageOutputDescription({
                executionReference: {type: 'UNKNOWN', id: 'outer-recipe'},
                bands: [
                    {},
                    band('red', 'mean'),
                    band('red', 'sample'),
                    'nir'
                ],
                evidence: 'runtime observation'
            })).toEqual(invalidResult(
                {code: 'MALFORMED_REFERENCE', path: ['executionReference', 'type']},
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'name']},
                {code: 'INCOMPLETE_IMAGE_OUTPUT', path: ['bands', 0, 'pyramidingPolicy']},
                {code: 'DUPLICATE_BAND_NAME', path: ['bands', 2, 'name']},
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['bands', 3]},
                {code: 'MALFORMED_IMAGE_OUTPUT', path: ['evidence']}
            ))
        })
    })

    it('returns independent mutable structures for independent calls', () => {
        const first = describeOutput({evidence: [{observation: 1}]})
        const second = describeOutput({evidence: [{observation: 1}]})

        expect(first).not.toBe(second)
        expect(first.description).not.toBe(second.description)
        expect(first.description.executionReference).not.toBe(second.description.executionReference)
        expect(first.description.output).not.toBe(second.description.output)
        expect(first.description.output.bands).not.toBe(second.description.output.bands)
        expect(first.description.output.bands[0]).not.toBe(second.description.output.bands[0])
        expect(first.description.evidence).not.toBe(second.description.evidence)
        expect(first.diagnostics).not.toBe(second.diagnostics)
    })

    it('creates independent default evidence arrays for independent calls', () => {
        const first = describeOutput()
        const second = describeOutput()

        expect(first.description.evidence).toEqual([])
        expect(second.description.evidence).toEqual([])
        expect(first.description.evidence).not.toBe(second.description.evidence)
    })

    it('owns returned structures without cloning opaque evidence entries', () => {
        const executionReference = recipeReference('selected-outer-recipe')
        const bands = [band('red', 'mean')]
        const evidence = [{observation: 1}]
        const input = {executionReference, bands, evidence}
        const before = structuredClone(input)
        const {description} = imageOutputDescription(input)

        expect(description.executionReference).not.toBe(executionReference)
        expect(description.output.bands).not.toBe(bands)
        expect(description.output.bands[0]).not.toBe(bands[0])
        expect(description.evidence).not.toBe(evidence)
        expect(description.evidence[0]).toBe(evidence[0])

        description.executionReference.id = 'changed-recipe'
        description.output.bands[0].name = 'changed-band'
        description.output.bands.push(band('added-band', 'sample'))
        description.evidence.push({observation: 2})

        expect(input).toEqual(before)
    })

    it('represents an explicitly empty band schema without a diagnosis', () => {
        expect(describeOutput({bands: []})).toEqual(validResult({bands: []}))
    })
})
