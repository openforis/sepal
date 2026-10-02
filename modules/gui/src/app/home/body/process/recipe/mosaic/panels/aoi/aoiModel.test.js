import {modelToValues, valuesToModel} from './aoiModel'

describe('aoi asset/recipe source mapping', () => {
    it('opens a saved ASSET model as the combined SOURCE section with ASSET selected', () => {
        expect(modelToValues({type: 'ASSET', id: 'projects/p/assets/x'})).toEqual({
            section: 'SOURCE',
            sourceType: 'ASSET',
            assetId: 'projects/p/assets/x'
        })
    })

    it('opens a saved RECIPE model as the combined SOURCE section with RECIPE selected (populating recipeId, not assetId)', () => {
        const values = modelToValues({type: 'RECIPE', id: 'recipe-123'})
        expect(values).toEqual({
            section: 'SOURCE',
            sourceType: 'RECIPE',
            recipeId: 'recipe-123'
        })
        expect(values.assetId).toBeUndefined()
    })

    it('round-trips ASSET source values back to an explicit ASSET model', () => {
        expect(valuesToModel({section: 'SOURCE', sourceType: 'ASSET', assetId: 'a1', recipeId: 'r1'}))
            .toEqual({type: 'ASSET', id: 'a1'})
    })

    it('round-trips RECIPE source values back to an explicit RECIPE model', () => {
        expect(valuesToModel({section: 'SOURCE', sourceType: 'RECIPE', assetId: 'a1', recipeId: 'r1'}))
            .toEqual({type: 'RECIPE', id: 'r1'})
    })

    it('throws rather than defaulting to ASSET when the source type is missing', () => {
        expect(() => valuesToModel({section: 'SOURCE', assetId: 'a1'})).toThrow()
    })
})

describe('aoi GeoID mapping', () => {
    const GEOID = '40df4325-744f-8fae-8e46-049080be5554'

    it('stores the canonical GeoID read from the pasted text, never the text', () => {
        expect(valuesToModel({section: 'GEOID', geoId: `https://data.apps.fao.org/geoid/${GEOID.toUpperCase()}`, bufferMeters: ''}))
            .toEqual({type: 'GEOID', id: GEOID})
    })

    it('stores a buffer in metres when there is one', () => {
        expect(valuesToModel({section: 'GEOID', geoId: GEOID, bufferMeters: '1000'}))
            .toEqual({type: 'GEOID', id: GEOID, bufferMeters: 1000})
    })

    // Zero is a boundary used as it is, not "no buffer given": it must not turn into the geometry's default.
    it('keeps an explicit zero buffer through saving and reopening', () => {
        const model = valuesToModel({section: 'GEOID', geoId: GEOID, bufferMeters: '0'})

        expect(model).toEqual({type: 'GEOID', id: GEOID, bufferMeters: 0})
        expect(modelToValues(model)).toEqual({section: 'GEOID', geoId: GEOID, bufferMeters: 0})
    })

    it('opens a saved GeoID without a buffer with an empty buffer, meaning the geometry\'s default', () => {
        expect(modelToValues({type: 'GEOID', id: GEOID}))
            .toEqual({section: 'GEOID', geoId: GEOID, bufferMeters: ''})
    })
})
