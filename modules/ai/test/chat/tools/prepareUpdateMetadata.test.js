const {of} = require('rxjs')
const {prepareUpdateTool} = require('#mcp/chat/tools/prepareUpdateTool')
const {aFakeGuiRequests, read} = require('../builders')

// prepare_update derives companions from the recipe's validation coupling, not
// a hand-maintained one-way path->companions map. For MOSAIC the only date-window
// constraints couple targetDate with seasonStart and seasonEnd (seasonStartWindow,
// seasonEndWindow); yearsBefore/yearsAfter are in NO date-window constraint and
// must NOT be pulled in. The packet also carries the facts that justify the
// companions (dependencyFacts) and the rule shapes behind them (validationRules).
describe('prepare_update tool — constraint-derived metadata', () => {

    const context = {clientId: 'c1', subscriptionId: 's1'}

    function aMosaicGuiResponse(overrides = {}) {
        return {
            id: 'r1',
            type: 'MOSAIC',
            modelHash: 'h-base',
            model: {
                dates: {
                    type: 'YEARLY_TIME_SCAN',
                    targetDate: '2024-07-02',
                    seasonStart: '2024-01-01',
                    seasonEnd: '2025-01-01',
                    yearsBefore: 0,
                    yearsAfter: 0
                },
                sources: {dataSets: {LANDSAT: ['LANDSAT_9']}},
                sceneSelectionOptions: {type: 'ALL'},
                compositeOptions: {corrections: ['SR', 'BRDF']}
            },
            ...overrides
        }
    }

    function packet(focusPaths) {
        const tool = prepareUpdateTool(aFakeGuiRequests(() => of(aMosaicGuiResponse())))
        return read(tool.invoke$({recipeId: 'r1', focusPaths}, context)).data
    }

    describe('schema', () => {

        it('declares recipeId + focusPaths and NO instruction property', () => {
            const tool = prepareUpdateTool(aFakeGuiRequests())

            expect(Object.keys(tool.parameters.properties).sort()).toEqual(['focusPaths', 'recipeId'])
            expect(tool.parameters.properties).not.toHaveProperty('instruction')
        })
    })

    describe('focusing /dates/targetDate', () => {

        const focusPaths = ['/dates/targetDate']

        it('couples the season-window bounds as dependentPaths', () => {
            const data = packet(focusPaths)

            expect(data.dependentPaths).toEqual(expect.arrayContaining([
                '/dates/seasonStart',
                '/dates/seasonEnd'
            ]))
        })

        it('does NOT couple the surrounding-years span, which no date-window constraint references', () => {
            const data = packet(focusPaths)

            expect(data.dependentPaths).not.toContain('/dates/yearsBefore')
            expect(data.dependentPaths).not.toContain('/dates/yearsAfter')
        })

        it('sets writablePaths to focusPaths union dependentPaths', () => {
            const data = packet(focusPaths)

            expect(data.writablePaths.sort()).toEqual([
                '/dates/seasonEnd',
                '/dates/seasonStart',
                '/dates/targetDate'
            ])
        })

        it('returns currentValues for every writable path', () => {
            const data = packet(focusPaths)

            expect(Object.keys(data.currentValues).sort()).toEqual(data.writablePaths.sort())
            expect(data.currentValues['/dates/targetDate']).toBe('2024-07-02')
            expect(data.currentValues['/dates/seasonStart']).toBe('2024-01-01')
            expect(data.currentValues['/dates/seasonEnd']).toBe('2025-01-01')
        })

        it('explains via dependencyFacts which constraint pulled in each season bound', () => {
            const data = packet(focusPaths)

            const facts = JSON.stringify(data.dependencyFacts)
            expect(data.dependencyFacts).toBeDefined()
            expect(facts).toMatch(/seasonStart/)
            expect(facts).toMatch(/seasonEnd/)
            expect(facts).toMatch(/season.*window/i)
        })

        it('identifies the date-window constraints in validationRules', () => {
            const data = packet(focusPaths)

            const rules = JSON.stringify(data.validationRules)
            expect(data.validationRules).toBeDefined()
            expect(rules).toMatch(/seasonStartWindow/)
            expect(rules).toMatch(/seasonEndWindow/)
        })
    })

    describe('focusing /dates/seasonStart', () => {

        it('couples targetDate symmetrically — the seasonStart window references both', () => {
            const data = packet(['/dates/seasonStart'])

            expect(data.dependentPaths).toContain('/dates/targetDate')
        })
    })

    describe('focusing /sources/dataSets', () => {

        it('couples the rule-derived source companions — corrections and scene-selection', () => {
            const data = packet(['/sources/dataSets'])

            expect(data.dependentPaths).toEqual(expect.arrayContaining([
                '/compositeOptions/corrections',
                '/sceneSelectionOptions/type'
            ]))
        })

        it('returns currentValues for the coupled source companions', () => {
            const data = packet(['/sources/dataSets'])

            expect(data.currentValues['/compositeOptions/corrections']).toEqual(['SR', 'BRDF'])
            expect(data.currentValues['/sceneSelectionOptions/type']).toBe('ALL')
        })
    })

    describe('focusing /compositeOptions/includedCloudMasking', () => {

        const focusPaths = ['/compositeOptions/includedCloudMasking']

        // The schema's allOf if/then required conditionals make each cloud-masking
        // method pull in its own required threshold/band/sub-option fields. The
        // specialist must see all of them as writable so it can patch the method
        // and its required companions in one atomic patch.
        it.each([
            '/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability',
            '/compositeOptions/sentinel2CloudScorePlusBand',
            '/compositeOptions/sentinel2CloudScorePlusMaxCloudProbability',
            '/compositeOptions/landsatCFMaskCloudMasking',
            '/compositeOptions/landsatCFMaskCloudShadowMasking',
            '/compositeOptions/landsatCFMaskCirrusMasking',
            '/compositeOptions/landsatCFMaskDilatedCloud',
            '/compositeOptions/sepalCloudScoreMaxCloudProbability'
        ])('couples the schema-required companion %s', companion => {
            const data = packet(focusPaths)

            expect(data.dependentPaths).toContain(companion)
            expect(data.writablePaths).toContain(companion)
        })

        it('returns a currentValues entry for every writable path, null for absent companions', () => {
            const data = packet(focusPaths)

            expect(Object.keys(data.currentValues).sort()).toEqual(data.writablePaths.sort())
            expect(data.currentValues['/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability']).toBeNull()
        })

        it('lists the absent cloud-masking companions in missingPaths so the specialist adds rather than replaces them', () => {
            const data = packet(focusPaths)

            expect(data.missingPaths).toEqual(expect.arrayContaining([
                '/compositeOptions/includedCloudMasking',
                '/compositeOptions/sentinel2CloudProbabilityMaxCloudProbability'
            ]))
            // corrections is present in the fixture, so it stays on the existing side.
            expect(data.existingPaths).toContain('/compositeOptions/corrections')
            expect(data.missingPaths).not.toContain('/compositeOptions/corrections')
        })
    })

    describe('focusing /compositeOptions/corrections', () => {

        it('couples brdfMultiplier, which BRDF requires', () => {
            const data = packet(['/compositeOptions/corrections'])

            expect(data.dependentPaths).toContain('/compositeOptions/brdfMultiplier')
            expect(data.writablePaths).toContain('/compositeOptions/brdfMultiplier')
        })
    })

    // pathHints tell the patch planner how to address each writable path: a
    // required enum/config array (replace wholesale) vs a scalar, plus the live
    // array length — so it does not remove a required field or address an array
    // member by value name.
    describe('pathHints', () => {

        it('marks a required enum/config array with its kind and live length', () => {
            const data = packet(['/compositeOptions/corrections'])

            expect(data.pathHints['/compositeOptions/corrections']).toEqual({
                valueKind: 'array',
                arrayKind: 'config',
                arrayLength: 2,
                required: true
            })
        })

        it('marks a required scalar field', () => {
            const data = packet(['/dates/targetDate'])

            expect(data.pathHints['/dates/targetDate']).toEqual({valueKind: 'scalar', required: true})
        })

        it('carries a hint for every writable path', () => {
            const data = packet(['/compositeOptions/corrections'])

            expect(Object.keys(data.pathHints).sort()).toEqual([...data.writablePaths].sort())
        })
    })

    describe('error envelopes', () => {

        function result(response, focusPaths = ['/dates/targetDate']) {
            const tool = prepareUpdateTool(aFakeGuiRequests(() => of(response)))
            return read(tool.invoke$({recipeId: 'r1', focusPaths}, context))
        }

        it('rejects a load-recipe response with no modelHash', () => {
            const {modelHash: _omitted, ...withoutHash} = aMosaicGuiResponse()

            expect(result(withoutHash)).toMatchObject({ok: false, error: {code: 'MISSING_MODEL_HASH'}})
        })

        it('rejects an unsupported recipe type', () => {
            expect(result(aMosaicGuiResponse({type: 'UNKNOWN'}))).toMatchObject({
                ok: false, error: {code: 'UNSUPPORTED_RECIPE_TYPE'}
            })
        })
    })
})
