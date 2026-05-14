const {projectLoadedRecipe} = require('#mcp/chat/sendMessage/recipeProjection')

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

    it('projects a root load to compact identity fields plus the projected model', () => {
        expect(projectLoadedRecipe(classificationRecipe)).toEqual({
            id: 'r1',
            type: 'CLASSIFICATION',
            name: 'Kenya land cover',
            projectId: 'p1',
            modelHash: 'hash-abc',
            model: {
                trainingData: {dataSets: [{dataSetId: 'd1', type: 'COLLECTED', referenceData: referenceDataMarker}]},
                classifier: {type: 'RANDOM_FOREST', numberOfTrees: 25},
                legend: {entries: [{value: 1, label: 'forest'}]}
            }
        })
    })

    it('omits projectId when the recipe has none', () => {
        const {projectId: _projectId, ...withoutProject} = classificationRecipe

        const result = projectLoadedRecipe(withoutProject)

        expect(result).not.toHaveProperty('projectId')
    })

    it('returns the requested fragment under value for a path-scoped load', () => {
        const result = projectLoadedRecipe(classificationRecipe, '/classifier')

        expect(result).toEqual({
            id: 'r1', type: 'CLASSIFICATION', name: 'Kenya land cover', projectId: 'p1', modelHash: 'hash-abc',
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

    it('throws on a missing path', () => {
        expect(() => projectLoadedRecipe(classificationRecipe, '/missing')).toThrow(/not found/)
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

        expect(result.model.trainingData.dataSets[0].referenceData).toBeNull()
    })

    it('returns a non-CLASSIFICATION model unprojected', () => {
        const mosaicRecipe = {
            id: 'r2', type: 'MOSAIC', title: 'Optical mosaic', modelHash: 'hash-xyz',
            model: {dates: {targetDate: '2024-06-01'}, sources: {LANDSAT: ['LANDSAT_8']}}
        }

        expect(projectLoadedRecipe(mosaicRecipe)).toEqual({
            id: 'r2', type: 'MOSAIC', name: 'Optical mosaic', modelHash: 'hash-xyz',
            model: {dates: {targetDate: '2024-06-01'}, sources: {LANDSAT: ['LANDSAT_8']}}
        })
    })
})
