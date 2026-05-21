const {assembleSpecialistPrompt} = require('#mcp/chat/specialists/assembleSpecialistPrompt')

const BASE = 'BASE PROMPT CONTENT'

function aSpec(overrides = {}) {
    return {
        id: 'MOSAIC',
        name: 'Optical Mosaic',
        describeFacts: () => ({
            description: 'A short recipe description.',
            outputs: 'produces bands A, B, C'
        }),
        editFacts: () => ({
            guidance: [
                'edit rule one — patch /a together with /b',
                'edit rule two — never set X while Y is present'
            ]
        }),
        schema: {type: 'object', properties: {mode: {enum: ['RAW'], 'x-enumLabels': {RAW: 'readable label'}}}},
        ...overrides
    }
}

describe('assembleSpecialistPrompt', () => {

    describe('shared behaviour', () => {

        it('returns the base prompt unchanged when spec is null', () => {
            expect(assembleSpecialistPrompt(BASE, null, {purpose: 'describe'})).toBe(BASE)
            expect(assembleSpecialistPrompt(BASE, null, {purpose: 'update'})).toBe(BASE)
        })

        it('throws when purpose is missing — purpose is required so the caller picks the right facts bucket', () => {
            expect(() => assembleSpecialistPrompt(BASE, aSpec())).toThrow(/purpose/)
        })

        it('throws on an unknown purpose', () => {
            expect(() => assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'invent'})).toThrow(/purpose/)
        })

        it('places the base prompt at the start (cache-stable prefix)', () => {
            const describeOut = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'describe'})
            const updateOut = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'update'})

            expect(describeOut.indexOf(BASE)).toBe(0)
            expect(updateOut.indexOf(BASE)).toBe(0)
        })

        it('includes the recipe type name without exposing the internal type id', () => {
            const out = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'describe'})

            expect(out).toContain('Recipe type: Optical Mosaic')
            expect(out).not.toContain('MOSAIC')
        })
    })

    describe('purpose: describe', () => {

        it('renders description and outputs from describeFacts', () => {
            const out = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'describe'})

            expect(out).toContain('A short recipe description.')
            expect(out).toContain('produces bands A, B, C')
        })

        it('renders schema-derived value labels so raw enum values can be translated in prose', () => {
            const out = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'describe'})

            expect(out).toContain('Value labels:')
            expect(out).toContain('/mode: RAW(readable label)')
        })

        it('does NOT include selection-bucket fields (useCases / chooseWhen / dontChooseWhen)', () => {
            const spec = aSpec({
                selectionFacts: () => ({
                    description: 'unused',
                    useCases: ['use case one'],
                    chooseWhen: 'pick when X',
                    dontChooseWhen: 'avoid when Y',
                    outputs: 'unused'
                })
            })

            const out = assembleSpecialistPrompt(BASE, spec, {purpose: 'describe'})

            expect(out).not.toMatch(/Choose when:/)
            expect(out).not.toMatch(/Use cases:/)
            expect(out).not.toContain('pick when X')
            expect(out).not.toContain('avoid when Y')
            expect(out).not.toContain('use case one')
        })

        it('does NOT include edit guidance (that belongs to the update purpose)', () => {
            const out = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'describe'})

            expect(out).not.toMatch(/Edit guidance:/)
            expect(out).not.toContain('edit rule one')
        })

        it('does NOT include the schema even when includeSchema is true (describe is read-only)', () => {
            const spec = aSpec({schema: {type: 'object', properties: {compositeOptions: {type: 'object'}}}})

            const out = assembleSpecialistPrompt(BASE, spec, {purpose: 'describe', includeSchema: true})

            expect(out).not.toContain('compositeOptions')
            expect(out).not.toMatch(/```json/)
        })

        it('returns the base prompt unchanged when the spec has no describeFacts', () => {
            const spec = {id: 'X', name: 'X', editFacts: () => ({guidance: ['rule']})}

            expect(assembleSpecialistPrompt(BASE, spec, {purpose: 'describe'})).toBe(BASE)
        })
    })

    describe('purpose: update', () => {

        it('renders each guidance entry from editFacts as a bulleted line', () => {
            const out = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'update'})

            expect(out).toMatch(/^- edit rule one — patch \/a together with \/b$/m)
            expect(out).toMatch(/^- edit rule two — never set X while Y is present$/m)
        })

        it('does NOT include selection-bucket fields (useCases / chooseWhen / dontChooseWhen)', () => {
            const spec = aSpec({
                selectionFacts: () => ({
                    description: 'unused',
                    useCases: ['use case one'],
                    chooseWhen: 'pick when X',
                    dontChooseWhen: 'avoid when Y',
                    outputs: 'unused'
                })
            })

            const out = assembleSpecialistPrompt(BASE, spec, {purpose: 'update'})

            expect(out).not.toMatch(/Choose when:/)
            expect(out).not.toMatch(/Use cases:/)
            expect(out).not.toContain('pick when X')
            expect(out).not.toContain('avoid when Y')
            expect(out).not.toContain('use case one')
        })

        it('does NOT include describe-only outputs prose (that belongs to describe)', () => {
            const out = assembleSpecialistPrompt(BASE, aSpec(), {purpose: 'update'})

            expect(out).not.toContain('produces bands A, B, C')
        })

        it('omits the schema when includeSchema is false (default)', () => {
            const spec = aSpec({schema: {type: 'object', properties: {compositeOptions: {type: 'object'}}}})

            const out = assembleSpecialistPrompt(BASE, spec, {purpose: 'update'})

            expect(out).not.toContain('compositeOptions')
            expect(out).not.toMatch(/```json/)
        })

        it('appends the schema in a compact fenced json block when includeSchema is true', () => {
            const spec = aSpec({schema: {type: 'object', properties: {compositeOptions: {type: 'object'}}}})

            const out = assembleSpecialistPrompt(BASE, spec, {purpose: 'update', includeSchema: true})

            expect(out).toMatch(/```json/)
            expect(out).toContain(JSON.stringify(spec.schema))
            expect(out).not.toContain('  "type"')
        })

        it('places the schema after the edit-guidance section (base-first, then facts, then schema)', () => {
            const spec = aSpec({schema: {type: 'object', properties: {compositeOptions: {type: 'object'}}}})

            const out = assembleSpecialistPrompt(BASE, spec, {purpose: 'update', includeSchema: true})

            expect(out.indexOf('edit rule one')).toBeLessThan(out.indexOf('compositeOptions'))
        })

        it('returns the base prompt unchanged when the spec has no editFacts', () => {
            const spec = {id: 'X', name: 'X', describeFacts: () => ({description: 'd', outputs: 'o'})}

            expect(assembleSpecialistPrompt(BASE, spec, {purpose: 'update'})).toBe(BASE)
        })
    })
})
