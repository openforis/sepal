const {concat, of, throwError, toArray} = require('rxjs')
const {prepareHandlePacket$} = require('#mcp/chat/specialists/updateRecipe/prepareHandlePacket')
const {emitChannel, guiAction, isChannelEmission} = require('#mcp/chat/channelEvents')
const {aFakeBus, aFakeGuiRequests, expectNoHandlePathsIn, read} = require('../../builders')

const context = {clientId: 'c1', subscriptionId: 's1'}

describe('prepareHandlePacket$', () => {

    it('issues a load-recipe GUI request for the requested recipeId', () => {
        const guiRequests = loadRecipe(aMosaicRecipe())
        read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

        expect(guiRequests.requests).toEqual([{
            clientId: 'c1', subscriptionId: 's1', action: 'load-recipe', params: {recipeId: 'r1'}
        }])
    })

    it('carries the recipe modelHash through as baseModelHash', () => {
        const guiRequests = loadRecipe(aMosaicRecipe({modelHash: 'h-current'}))

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

        expect(result.ok).toBe(true)
        expect(result.data.baseModelHash).toBe('h-current')
    })

    it('passes GUI channel emissions through and only builds the packet from the load-recipe response', async () => {
        const recipe = aMosaicRecipe({modelHash: 'h-current'})
        const guiRequests = aFakeGuiRequests(() => concat(
            of(emitChannel(guiAction({requestId: 'req-1', action: 'load-recipe', params: {recipeId: 'r1'}}))),
            of(recipe)
        ))

        const emissions = await prepareHandlePacket$({
            guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context
        }).pipe(toArray()).toPromise()

        expect(emissions).toHaveLength(2)
        expect(isChannelEmission(emissions[0])).toBe(true)
        expect(emissions[1].ok).toBe(true)
        expect(emissions[1].data.baseModelHash).toBe('h-current')
    })

    it('returns the picked handles unchanged', () => {
        const guiRequests = loadRecipe(aMosaicRecipe())

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

        expect(result.data.pickedHandles).toEqual(['targetDate'])
    })

    it('keys the fields object by handle and includes current value, description, and value guidance', () => {
        const guiRequests = loadRecipe(aMosaicRecipe())

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

        const field = result.data.fields.targetDate
        expect(field.currentValue).toBe('2024-07-02')
        expect(typeof field.description).toBe('string')
        expect(field.description.length).toBeGreaterThan(0)
        expect(typeof field.valueGuidance).toBe('string')
    })

    describe('field entries carry handle metadata for user-language reasoning', () => {

        function fieldFor(handleName, pickedHandles = [handleName]) {
            const guiRequests = loadRecipe(aMosaicRecipe())
            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles, context}))
            return result.data.fields[handleName]
        }

        it('includes the user-facing label', () => {
            expect(fieldFor('cloudBuffer').label).toBe('Cloud-edge buffer')
            expect(fieldFor('datasets').label).toBe('Source datasets')
        })

        it('includes valueLabels for enum-bearing handles', () => {
            expect(fieldFor('tileOverlap').valueLabels).toEqual({
                KEEP: 'keep overlap', QUICK_REMOVE: 'quickly remove overlap', REMOVE: 'fully remove overlap'
            })
        })

        it('includes performanceNote on cost-sensitive handles', () => {
            expect(fieldFor('cloudBuffer').performanceNote).toMatch(/spatial|expensive/i)
        })

        it('includes summaryGuidance on handles that have it', () => {
            expect(typeof fieldFor('cloudBuffer').summaryGuidance).toBe('string')
        })

        it('carries cloudMethods guidance that residual-cloud requests tighten methods instead of disabling them', () => {
            const guidance = fieldFor('cloudMethods', ['cloudMethods']).valueGuidance

            expect(guidance).toMatch(/disables cloud masking|leaves more clouds/i)
            expect(guidance).toMatch(/too cloudy|residual clouds|cloudy images/i)
            expect(guidance).toMatch(/aggressive profiles/i)
            expect(guidance).toMatch(/explicitly asks to disable/i)
        })

        it('includes shape-clarifying examples on handles that have them', () => {
            expect(fieldFor('datasets').examples).toContainEqual({LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']})
            expect(fieldFor('cloudMethods', ['cloudMethods']).examples).toContainEqual(['sepalCloudScore', 'landsatCFMask'])
        })

        it('marks schema-required handles with required=true', () => {
            // `compose` is required in the MOSAIC compositeOptions schema.
            expect(fieldFor('compose').required).toBe(true)
            // `brdfMultiplier` is conditionally required (only when BRDF is included);
            // unconditional required is false.
            expect(fieldFor('brdfMultiplier').required).toBe(false)
        })

        it('does not duplicate handle metadata in parallel top-level maps', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())
            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudBuffer'], context}))
            expect(result.data).not.toHaveProperty('labels')
            expect(result.data).not.toHaveProperty('descriptions')
            expect(result.data).not.toHaveProperty('valueLabels')
        })
    })

    it('uses null currentValue for a handle whose path is absent from the model', () => {
        const recipe = aMosaicRecipe()
        delete recipe.model.compositeOptions.sentinel2CloudProbabilityMaxCloudProbability
        const guiRequests = loadRecipe(recipe)

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['s2CloudProbabilityMax'], context}))

        expect(result.data.fields.s2CloudProbabilityMax.currentValue).toBeNull()
    })

    describe('rule expansion — writable subjects vs read-only context', () => {

        it('promotes the rule subjects of seasonStartWindow/seasonEndWindow to writable when targetDate is picked', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

            expect(result.data.writableHandles.sort()).toEqual(['seasonEnd', 'seasonStart', 'targetDate'])
            expect(result.data.readOnlyHandles).toEqual([])
        })

        it('promotes corrections and sceneSelection to writable when datasets is picked (datasets is the trigger; both are rule subjects)', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['datasets'], context}))

            expect(result.data.writableHandles).toEqual(expect.arrayContaining(['datasets', 'corrections', 'sceneSelection']))
        })

        it('keeps datasets and corrections as read-only context when only cloudMethods is picked (cloudMethods is the rule subject; the rest are validation triggers)', () => {
            // The previous "fixed point" behaviour promoted corrections to
            // writable via cloudMaskingMethodAvailability, then brdfMultiplier
            // via the schema's "BRDF requires brdfMultiplier" rule. That's the
            // exact detour we're cutting: read-only context must not seed
            // further writable expansion.
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudMethods'], context}))

            expect(result.data.writableHandles).toContain('cloudMethods')
            expect(result.data.writableHandles).not.toContain('corrections')
            expect(result.data.writableHandles).not.toContain('brdfMultiplier')
            expect(result.data.readOnlyHandles).toEqual(expect.arrayContaining(['corrections', 'datasets']))
            // brdfMultiplier is not pulled in at all (its rule wasn't activated by
            // any writable focus path — corrections is read-only).
            expect(result.data.readOnlyHandles).not.toContain('brdfMultiplier')
        })

        it('exposes readOnlyFields entries (label + currentValue) for read-only context handles so the updater can inspect them', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudMethods'], context}))

            expect(result.data.readOnlyFields.corrections.label).toBe('Radiometric corrections')
            expect(Array.isArray(result.data.readOnlyFields.corrections.currentValue)).toBe(true)
            expect(result.data.readOnlyFields.datasets.label).toBe('Source datasets')
            expect(typeof result.data.readOnlyFields.datasets.currentValue).toBe('object')
            // Writable handles do not appear in readOnlyFields.
            expect(result.data.readOnlyFields).not.toHaveProperty('cloudMethods')
        })

        it('emits a dependencyFacts entry per read-only handle naming the constraint that pulled it in as context', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudMethods'], context}))

            expect(result.data.dependencyFacts).toEqual(expect.arrayContaining([
                expect.objectContaining({handle: 'corrections', constraint: 'cloudMaskingMethodAvailability'}),
                expect.objectContaining({handle: 'datasets', constraint: 'cloudMaskingMethodAvailability'})
            ]))
        })

        it('summarizes validation rules with handle names (never paths), referencing both writable and read-only handles', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['datasets'], context}))

            const rule = result.data.validationRules.find(r => r.name === 'multipleSourcesRequireCalibrate')
            expect(rule.handles.sort()).toEqual(['corrections', 'datasets'])
            expect(rule).not.toHaveProperty('paths')
        })

        it('dependencyFacts carry the read-only handle label', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudMethods'], context}))

            const corrections = result.data.dependencyFacts.find(fact => fact.handle === 'corrections')
            expect(corrections.label).toBe('Radiometric corrections')
        })
    })

    describe('coupling expansion is generic — driven by handle-declared metadata', () => {

        function recipeWith({cloudMethods, datasets}) {
            const recipe = aMosaicRecipe()
            if (cloudMethods) recipe.model.compositeOptions.includedCloudMasking = cloudMethods
            if (datasets) recipe.model.sources.dataSets = datasets
            return recipe
        }

        it('fires condition-based couplings whose trigger handle is writable and whose condition holds (datasets missing a group)', () => {
            const guiRequests = loadRecipe(recipeWith({
                cloudMethods: ['sepalCloudScore'],
                datasets: {LANDSAT: ['LANDSAT_9']}
            }))

            const result = read(prepareHandlePacket$({
                guiRequests, recipeId: 'r1', recipeType: 'MOSAIC',
                pickedHandles: ['datasets'], context
            }))

            const triggers = result.data.couplingFacts.map(fact => fact.triggerHandle)
            expect(triggers).toContain('datasets')
            const facts = result.data.couplingFacts.filter(f => f.triggerHandle === 'datasets')
            expect(facts.some(f => f.condition?.kind === 'missingKey' && f.condition.value === 'SENTINEL_2')).toBe(true)
        })

        it('does not emit a coupling fact for a condition that does not hold', () => {
            const guiRequests = loadRecipe(recipeWith({
                cloudMethods: ['sepalCloudScore'],
                datasets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}
            }))

            const result = read(prepareHandlePacket$({
                guiRequests, recipeId: 'r1', recipeType: 'MOSAIC',
                pickedHandles: ['datasets'], context
            }))

            // datasets has both groups present, so the missing-group couplings do not fire.
            const facts = result.data.couplingFacts.filter(f => f.triggerHandle === 'datasets')
            expect(facts).toEqual([])
        })

        it('chains coupling expansions to a fixed point (datasets missing → cloudMethods → its method companions)', () => {
            // datasets currently has both groups but cloudMethods only includes Landsat-only methods;
            // dropping SENTINEL_2 (picker chose datasets) expands cloudMethods, which then expands
            // its own Landsat companions because cloudMethods includes landsatCFMask.
            const guiRequests = loadRecipe(recipeWith({
                cloudMethods: ['sepalCloudScore', 'landsatCFMask'],
                datasets: {LANDSAT: ['LANDSAT_9']}
            }))

            const result = read(prepareHandlePacket$({
                guiRequests, recipeId: 'r1', recipeType: 'MOSAIC',
                pickedHandles: ['datasets'], context
            }))

            expect(result.data.writableHandles).toEqual(expect.arrayContaining([
                'cloudMethods',
                'landsatCloudMask', 'landsatShadowMask', 'landsatCirrusMask', 'landsatDilatedCloud',
                'sepalCloudScoreMax'
            ]))
        })

        it('emits coupling facts in handle terms with condition + expands + optional guidance', () => {
            const guiRequests = loadRecipe(recipeWith({
                cloudMethods: ['sepalCloudScore'],
                datasets: {LANDSAT: ['LANDSAT_9']}
            }))

            const result = read(prepareHandlePacket$({
                guiRequests, recipeId: 'r1', recipeType: 'MOSAIC',
                pickedHandles: ['datasets'], context
            }))

            const fact = result.data.couplingFacts.find(f => f.triggerHandle === 'datasets' && f.condition?.value === 'SENTINEL_2')
            expect(fact.involvedHandles.sort()).toEqual(['cloudMethods', 'datasets'])
            expect(fact.expands).toEqual(['cloudMethods'])
            expect(typeof fact.guidance).toBe('string')
        })

        it('eagerly expands every selector-item companion into writable so the updater can swap items, not just append', () => {
            const guiRequests = loadRecipe(recipeWith({
                cloudMethods: ['sepalCloudScore'],
                datasets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}
            }))

            const result = read(prepareHandlePacket$({
                guiRequests, recipeId: 'r1', recipeType: 'MOSAIC',
                pickedHandles: ['cloudMethods'], context
            }))

            // Even though cloudMethods currently has only sepalCloudScore, every
            // rich-item companion is writable so the updater can switch to any item.
            expect(result.data.writableHandles).toEqual(expect.arrayContaining([
                'sepalCloudScoreMax',
                's2CloudScoreBand', 's2CloudScoreMax',
                's2CloudProbabilityMax',
                'landsatCloudMask', 'landsatShadowMask', 'landsatCirrusMask', 'landsatDilatedCloud'
            ]))
        })

        it('exposes the rich selector-item metadata on the field entry so the updater can read alternativeGroup + profiles', () => {
            const guiRequests = loadRecipe(recipeWith({
                cloudMethods: ['sepalCloudScore', 'landsatCFMask'],
                datasets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}
            }))

            const result = read(prepareHandlePacket$({
                guiRequests, recipeId: 'r1', recipeType: 'MOSAIC',
                pickedHandles: ['cloudMethods'], context
            }))

            const item = result.data.fields.cloudMethods.allowedItems.find(i => i.value === 'sentinel2CloudScorePlus')
            expect(item.alternativeGroup).toBe('sentinel2CloudMask')
            expect(item.companionHandles).toEqual(['s2CloudScoreBand', 's2CloudScoreMax'])
            expect(item.profiles.moderate).toEqual({s2CloudScoreBand: 'cs_cdf', s2CloudScoreMax: 45})
            expect(item.profiles.aggressive).toEqual({s2CloudScoreBand: 'cs', s2CloudScoreMax: 35})
        })

        it('couplingFacts and field entries never carry JSON Pointer paths', () => {
            const guiRequests = loadRecipe(recipeWith({
                cloudMethods: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
                datasets: {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}
            }))

            const result = read(prepareHandlePacket$({
                guiRequests, recipeId: 'r1', recipeType: 'MOSAIC',
                pickedHandles: ['cloudMethods', 'datasets'], context
            }))

            expectNoHandlePathsIn(result.data)
        })
    })

    describe('applicability facts for inapplicable selector items', () => {

        it('flags a Sentinel-2-only item on a Landsat-only recipe, naming the scope handle and the missing key', () => {
            const packet = prepareFor({recipe: aLandsatOnlyMosaic(), pickedHandles: ['cloudMethods']})

            expect(factFor(packet, 'sentinel2CloudScorePlus')).toMatchObject({
                selectorHandle: 'cloudMethods',
                itemLabel: 'Sentinel-2 Cloud Score+',
                requires: {handle: 'datasets', anyOfKeys: ['SENTINEL_2']}
            })
        })

        it('carries the current scope-handle value so the updater can see what is there now', () => {
            const packet = prepareFor({recipe: aLandsatOnlyMosaic(), pickedHandles: ['cloudMethods']})

            expect(factFor(packet, 'sentinel2CloudScorePlus').currentValue).toEqual({LANDSAT: ['LANDSAT_9']})
        })

        it('flags every inapplicable item on the writable selector, not just the first', () => {
            const packet = prepareFor({recipe: aLandsatOnlyMosaic(), pickedHandles: ['cloudMethods']})

            const flagged = packet.applicabilityFacts.map(fact => fact.item).sort()
            expect(flagged).toEqual(['pino26', 'sentinel2CloudProbability', 'sentinel2CloudScorePlus'])
        })

        it('is symmetric in the scope vocabulary: a Landsat-only item on a Sentinel-2-only recipe is flagged the same way', () => {
            const packet = prepareFor({recipe: aSentinel2OnlyMosaic(), pickedHandles: ['cloudMethods']})

            expect(factFor(packet, 'landsatCFMask')).toMatchObject({
                selectorHandle: 'cloudMethods',
                requires: {handle: 'datasets', anyOfKeys: ['LANDSAT']}
            })
        })

        it('emits no facts when every item\'s requirements are satisfied by the current scope handle', () => {
            const recipe = aMosaicRecipe()
            recipe.model.sources.dataSets = {LANDSAT: ['LANDSAT_9'], SENTINEL_2: ['SENTINEL_2']}
            const packet = prepareFor({recipe, pickedHandles: ['cloudMethods']})

            expect(packet.applicabilityFacts).toEqual([])
        })

        it('emits no facts when the selector handle is not writable (picker did not include it)', () => {
            const packet = prepareFor({recipe: aLandsatOnlyMosaic(), pickedHandles: ['targetDate']})

            expect(packet.applicabilityFacts).toEqual([])
        })

        it('renders per-fact guidance that names the scope handle and forbids silent prerequisite changes', () => {
            const packet = prepareFor({recipe: aLandsatOnlyMosaic(), pickedHandles: ['cloudMethods']})

            expect(factFor(packet, 'sentinel2CloudScorePlus').guidance).toMatch(/do not silently.*datasets/i)
        })

        it('carries no JSON Pointer paths', () => {
            const packet = prepareFor({recipe: aLandsatOnlyMosaic(), pickedHandles: ['cloudMethods']})

            expectNoHandlePathsIn(packet.applicabilityFacts)
        })
    })

    describe('writableHandles enforcement', () => {

        it('limits writableHandles to picked + explicit-intent expansions when no rule fires', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudBuffer'], context}))

            expect(result.data.writableHandles).toEqual(['cloudBuffer'])
            expect(result.data.readOnlyHandles).toEqual([])
        })
    })

    describe('packet hides JSON Pointer paths from the LLM contract', () => {

        it('keys fields by handle name, not path', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudMethods'], context}))

            for (const key of Object.keys(result.data.fields)) {
                expect(key).not.toMatch(/^\//)
            }
        })

        it('omits internal-path properties from the prepared packet shape', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudMethods'], context}))

            expect(result.data).not.toHaveProperty('writablePaths')
            expect(result.data).not.toHaveProperty('focusPaths')
            expect(result.data).not.toHaveProperty('currentValues')
            expect(result.data).not.toHaveProperty('pathHints')
        })

        it('field entries do not expose the internal path or pointer hints', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

            for (const field of Object.values(result.data.fields)) {
                expect(field).not.toHaveProperty('path')
                expect(field).not.toHaveProperty('pathHint')
            }
        })

        it('dependencyFacts entries are keyed by handle, not by path', () => {
            const guiRequests = loadRecipe(aMosaicRecipe())

            const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

            for (const fact of result.data.dependencyFacts) {
                expect(fact).toHaveProperty('handle')
                expect(fact).not.toHaveProperty('path')
            }
        })
    })

    it('returns a TOOL_FAILED envelope when GUI load-recipe errors', () => {
        const guiRequests = aFakeGuiRequests(() => throwError(() => new Error('boom')))

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate'], context}))

        expect(result).toMatchObject({ok: false, error: {code: 'TOOL_FAILED'}})
    })

    it('returns an UNKNOWN_HANDLE envelope when any picked handle is not in the recipe catalog', () => {
        const guiRequests = loadRecipe(aMosaicRecipe())

        const result = read(prepareHandlePacket$({guiRequests, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['targetDate', 'bogus'], context}))

        expect(result.ok).toBe(false)
        expect(result.error.code).toBe('UNKNOWN_HANDLE')
        expect(result.error.handles).toEqual(['bogus'])
    })

    describe('diagnostics', () => {

        it('publishes update_recipe.prepare.completed with picked/writable/readOnly counts and handle names', () => {
            const bus = aFakeBus()
            const guiRequests = loadRecipe(aMosaicRecipe())

            read(prepareHandlePacket$({guiRequests, bus, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudMethods'], context}))

            const events = bus.published.filter(event => event.type === 'update_recipe.prepare.completed')
            expect(events).toHaveLength(1)
            expect(events[0]).toMatchObject({
                recipeType: 'MOSAIC',
                pickedHandleCount: 1,
                writableHandles: expect.arrayContaining(['cloudMethods']),
                readOnlyHandles: expect.arrayContaining(['corrections', 'datasets'])
            })
            expect(events[0].readOnlyHandleCount).toBeGreaterThan(0)
        })

        it('the prepare.completed event does not carry guidance/value blobs — counts + names only', () => {
            const bus = aFakeBus()
            const guiRequests = loadRecipe(aMosaicRecipe())

            read(prepareHandlePacket$({guiRequests, bus, recipeId: 'r1', recipeType: 'MOSAIC', pickedHandles: ['cloudBuffer'], context}))

            const event = bus.published.find(event => event.type === 'update_recipe.prepare.completed')
            expect(event).not.toHaveProperty('fields')
            expect(event).not.toHaveProperty('couplingFacts')
            expect(event).not.toHaveProperty('validationRules')
        })
    })
})

function prepareFor({recipe, pickedHandles}) {
    const guiRequests = loadRecipe(recipe)
    return read(prepareHandlePacket$({
        guiRequests, recipeId: 'r1', recipeType: 'MOSAIC',
        pickedHandles, context
    })).data
}

function factFor(packet, itemValue) {
    return packet.applicabilityFacts.find(fact => fact.item === itemValue)
}

function aMosaicRecipe(overrides = {}) {
    return {
        id: 'r1',
        type: 'MOSAIC',
        modelHash: 'h-base',
        model: {
            dates: {type: 'YEARLY_TIME_SCAN', targetDate: '2024-07-02', seasonStart: '2024-01-01', seasonEnd: '2025-01-01', yearsBefore: 0, yearsAfter: 0},
            sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9']}},
            sceneSelectionOptions: {type: 'ALL', targetDateWeight: 0},
            compositeOptions: {
                corrections: ['SR', 'BRDF'],
                brdfMultiplier: 4,
                filters: [],
                orbitOverlap: 'KEEP',
                tileOverlap: 'QUICK_REMOVE',
                includedCloudMasking: ['sepalCloudScore', 'landsatCFMask'],
                landsatCFMaskCloudMasking: 'MODERATE',
                landsatCFMaskCloudShadowMasking: 'MODERATE',
                landsatCFMaskCirrusMasking: 'MODERATE',
                landsatCFMaskDilatedCloud: 'REMOVE',
                sepalCloudScoreMaxCloudProbability: 30,
                cloudBuffer: 0,
                holes: 'ALLOW',
                snowMasking: 'ON',
                compose: 'MEDOID'
            }
        },
        ...overrides
    }
}

function aLandsatOnlyMosaic() {
    const recipe = aMosaicRecipe()
    recipe.model.sources.dataSets = {LANDSAT: ['LANDSAT_9']}
    recipe.model.compositeOptions.includedCloudMasking = ['sepalCloudScore', 'landsatCFMask']
    return recipe
}

function aSentinel2OnlyMosaic() {
    const recipe = aMosaicRecipe()
    recipe.model.sources.dataSets = {SENTINEL_2: ['SENTINEL_2']}
    recipe.model.compositeOptions.corrections = ['SR']
    recipe.model.compositeOptions.includedCloudMasking = ['sepalCloudScore', 'sentinel2CloudScorePlus']
    recipe.model.compositeOptions.sentinel2CloudScorePlusBand = 'cs_cdf'
    recipe.model.compositeOptions.sentinel2CloudScorePlusMaxCloudProbability = 45
    return recipe
}

function loadRecipe(recipe) {
    return aFakeGuiRequests(request => {
        if (request.action === 'load-recipe') return of(recipe)
        return of({})
    })
}
