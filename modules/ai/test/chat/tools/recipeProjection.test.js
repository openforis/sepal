const {projectLoadedRecipe} = require('#mcp/chat/tools/recipeProjection')

describe('recipe projection', () => {

    const classificationRecipe = {
        id: 'r1',
        type: 'CLASSIFICATION',
        title: 'Kenya land cover',
        projectId: 'p1',
        modelHash: 'hash-abc',
        model: {
            trainingData: {
                dataSets: [
                    {dataSetId: 'd1', type: 'COLLECTED', referenceData: [
                        {x: 1, y: 2, class: 'forest'},
                        {x: 3, y: 4, class: 'water'}
                    ]}
                ]
            },
            classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25},
            legend: {entries: [{value: 1, label: 'forest'}]}
        }
    }

    const referenceDataMarker = {
        _omitted: 2,
        _kind: 'referenceData',
        _path: '/trainingData/dataSets/0/referenceData'
    }

    it('projects a root load to model fields at the root plus baseModelHash', () => {
        expect(projectLoadedRecipe(classificationRecipe)).toEqual({
            baseModelHash: 'hash-abc',
            trainingData: {dataSets: [{dataSetId: 'd1', type: 'COLLECTED', referenceData: referenceDataMarker}]},
            classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25},
            legend: {entries: [{value: 1, label: 'forest'}]}
        })
    })

    it('does not leak identity fields (id, type, name, projectId) — the LLM already has the recipeId and type was resolved by the dispatcher', () => {
        const result = projectLoadedRecipe(classificationRecipe)

        expect(result).not.toHaveProperty('id')
        expect(result).not.toHaveProperty('type')
        expect(result).not.toHaveProperty('name')
        expect(result).not.toHaveProperty('projectId')
        expect(result).not.toHaveProperty('model')
    })

    it('returns the requested fragment under value plus baseModelHash for a path-scoped load', () => {
        const result = projectLoadedRecipe(classificationRecipe, '/classifier')

        expect(result).toEqual({
            baseModelHash: 'hash-abc',
            value: {type: 'RANDOM_FOREST', numberOfTrees: 25}
        })
    })

    it('returns a specific referenceData item for an item path', () => {
        const result = projectLoadedRecipe(classificationRecipe, '/trainingData/dataSets/0/referenceData/1')

        expect(result.value).toEqual({x: 3, y: 4, class: 'water'})
    })

    it('returns the omitted marker when the path points at a referenceData array', () => {
        const result = projectLoadedRecipe(classificationRecipe, '/trainingData/dataSets/0/referenceData')

        expect(result.value).toEqual(referenceDataMarker)
    })

    it('omits nested referenceData when the path points above it', () => {
        const result = projectLoadedRecipe(classificationRecipe, '/trainingData/dataSets/0')

        expect(result.value).toEqual({dataSetId: 'd1', type: 'COLLECTED', referenceData: referenceDataMarker})
    })

    it('throws on invalid pointer syntax', () => {
        expect(() => projectLoadedRecipe(classificationRecipe, 'classifier')).toThrow(/Invalid JSON Pointer/)
    })

    it('returns no value for a missing path (the LLM gets a clean absent signal, not an error)', () => {
        const result = projectLoadedRecipe(classificationRecipe, '/missing')

        expect(result.value).toBeUndefined()
    })

    it('throws when the loaded recipe has no modelHash', () => {
        const {modelHash: _modelHash, ...withoutHash} = classificationRecipe

        expect(() => projectLoadedRecipe(withoutHash)).toThrow(/modelHash/)
    })

    it('passes a malformed non-array referenceData through unchanged', () => {
        const malformed = {
            id: 'r3', type: 'CLASSIFICATION', title: 'Broken', modelHash: 'h',
            model: {trainingData: {dataSets: [{dataSetId: 'd1', referenceData: null}]}}
        }

        const result = projectLoadedRecipe(malformed)

        expect(result.trainingData.dataSets[0].referenceData).toBeNull()
    })

    it('passes the model through byte-for-byte for a recipe type with no spec in the registry (silent-passthrough branch)', () => {
        const unspeccedRecipe = {
            id: 'r2', type: 'UNKNOWN_TYPE', title: 'No spec yet', modelHash: 'hash-xyz',
            model: {
                someField: {nested: 'value'},
                dormantLooking: 'still-here',
                arr: [1, 2, 3]
            }
        }

        const result = projectLoadedRecipe(unspeccedRecipe)

        expect(result).toEqual({
            baseModelHash: 'hash-xyz',
            someField: {nested: 'value'},
            dormantLooking: 'still-here',
            arr: [1, 2, 3]
        })
    })

    describe('MOSAIC recipe_load — effective-shape projection', () => {

        // Mirrors the GUI's persisted shape: LANDSAT-only sources with a dormant
        // sentinel2CloudScorePlus method + its tuning fields. Inline so the
        // assertions are unambiguous (no shared-lib defaultModel() import).
        const mosaicStored = {
            id: 'r-mosaic',
            type: 'MOSAIC',
            title: 'Kenya mosaic',
            projectId: 'p1',
            modelHash: 'hash-mosaic',
            model: {
                aoi: {type: 'POLYGON', path: [[36.7, -1.4], [37.0, -1.4], [37.0, -1.1]]},
                dates: {
                    type: 'YEARLY_TIME_SCAN',
                    targetDate: '2024-07-02',
                    seasonStart: '2024-01-01',
                    seasonEnd: '2025-01-01',
                    yearsBefore: 0, yearsAfter: 0
                },
                sources: {cloudPercentageThreshold: 75, dataSets: {LANDSAT: ['LANDSAT_9', 'LANDSAT_8']}},
                sceneSelectionOptions: {type: 'ALL', targetDateWeight: 0},
                compositeOptions: {
                    corrections: ['SR', 'BRDF'],
                    brdfMultiplier: 4,
                    filters: [],
                    orbitOverlap: 'KEEP',
                    tileOverlap: 'QUICK_REMOVE',
                    includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
                    sentinel2CloudScorePlusBand: 'cs_cdf',
                    sentinel2CloudScorePlusMaxCloudProbability: 45,
                    sentinel2CloudProbabilityMaxCloudProbability: 65,
                    landsatCFMaskCloudMasking: 'MODERATE',
                    landsatCFMaskCloudShadowMasking: 'MODERATE',
                    landsatCFMaskCirrusMasking: 'MODERATE',
                    landsatCFMaskDilatedCloud: 'REMOVE',
                    sepalCloudScoreMaxCloudProbability: 30,
                    cloudBuffering: 0,
                    holes: 'ALLOW',
                    snowMasking: 'ON',
                    compose: 'MEDOID'
                }
            }
        }

        it('returns the effective shape on a root load (model fields at root, dormant stripped)', () => {
            const result = projectLoadedRecipe(mosaicStored)

            expect(result.compositeOptions.includedCloudMasking).toEqual(['sepalCloudScore', 'landsatCFMask'])
            expect(result.compositeOptions).not.toHaveProperty('sentinel2CloudScorePlusBand')
            expect(result.compositeOptions).not.toHaveProperty('sentinel2CloudScorePlusMaxCloudProbability')
            expect(result.compositeOptions).not.toHaveProperty('sentinel2CloudProbabilityMaxCloudProbability')
        })

        it('returns no value for a path that targets a dormant-only field (the LLM cannot query stripped fields)', () => {
            const result = projectLoadedRecipe(mosaicStored, '/compositeOptions/sentinel2CloudScorePlusBand')

            expect(result.value).toBeUndefined()
        })

        it('returns the value for a path that targets an effective field', () => {
            const result = projectLoadedRecipe(mosaicStored, '/compositeOptions/landsatCFMaskCloudMasking')

            expect(result.value).toBe('MODERATE')
        })

        it('echoes the GUI-computed modelHash unchanged through projection as baseModelHash', () => {
            expect(projectLoadedRecipe(mosaicStored).baseModelHash).toBe('hash-mosaic')
            expect(projectLoadedRecipe(mosaicStored, '/compositeOptions/compose').baseModelHash).toBe('hash-mosaic')
        })
    })
})
