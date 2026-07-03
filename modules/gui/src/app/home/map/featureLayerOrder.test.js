import {canonicalizeFeatureLayerOrder, reorderAssetsByPointer, withFeatureLayerDisabled, withReorderedAssets} from './featureLayerOrder'

const featureLayers = () => [
    {sourceId: 'aoi'},
    {sourceId: 'labels', disabled: true},
    {sourceId: 'a1', layerConfig: {style: {colorMode: 'ONE_COLOR', color: '#111'}}},
    {sourceId: 'a2', layerConfig: {style: {colorMode: 'ONE_COLOR', color: '#222'}}},
    {sourceId: 'a3', layerConfig: {style: {colorMode: 'ONE_COLOR', color: '#333'}}}
]

describe('withFeatureLayerDisabled', () => {
    it('flips a single entry and preserves order', () => {
        const result = withFeatureLayerDisabled(featureLayers(), 'aoi', true)
        expect(result.map(({sourceId}) => sourceId)).toEqual(['aoi', 'labels', 'a1', 'a2', 'a3'])
        expect(result[0]).toEqual({sourceId: 'aoi', disabled: true})
    })

    it('preserves layerConfig when toggling', () => {
        const result = withFeatureLayerDisabled(featureLayers(), 'a1', true)
        expect(result[2].layerConfig).toEqual({style: {colorMode: 'ONE_COLOR', color: '#111'}})
    })

    it('returns untouched entries by reference', () => {
        const input = featureLayers()
        const result = withFeatureLayerDisabled(input, 'a1', true)
        expect(result[0]).toBe(input[0])
        expect(result[1]).toBe(input[1])
    })
})

describe('withReorderedAssets', () => {
    const assetIds = ['a1', 'a2', 'a3']

    it('reorders only asset entries and keeps built-ins fixed', () => {
        const result = withReorderedAssets(featureLayers(), assetIds, ['a3', 'a1', 'a2'])
        expect(result.map(({sourceId}) => sourceId)).toEqual(['aoi', 'labels', 'a3', 'a1', 'a2'])
    })

    it('groups assets into a contiguous band, keeping built-ins in relative order', () => {
        const layers = [{sourceId: 'a1'}, {sourceId: 'aoi'}, {sourceId: 'a2'}]
        const result = withReorderedAssets(layers, ['a1', 'a2'], ['a2', 'a1'])
        expect(result.map(({sourceId}) => sourceId)).toEqual(['a2', 'a1', 'aoi'])
    })

    it('preserves each asset entry (and its layerConfig) by reference across reorder', () => {
        const input = featureLayers()
        const result = withReorderedAssets(input, assetIds, ['a3', 'a1', 'a2'])
        expect(result[2]).toBe(input[4]) // a3
        expect(result[3]).toBe(input[2]) // a1
        expect(result[0]).toBe(input[0]) // aoi untouched
        expect(result[2].layerConfig).toEqual({style: {colorMode: 'ONE_COLOR', color: '#333'}})
    })

    it('appends assets omitted from the desired order in their prior order', () => {
        const result = withReorderedAssets(featureLayers(), assetIds, ['a3'])
        expect(result.map(({sourceId}) => sourceId)).toEqual(['aoi', 'labels', 'a3', 'a1', 'a2'])
    })

    it('ignores unknown/duplicate ids in the desired order', () => {
        const result = withReorderedAssets(featureLayers(), assetIds, ['a2', 'nope', 'a2', 'aoi', 'a1'])
        expect(result.map(({sourceId}) => sourceId)).toEqual(['aoi', 'labels', 'a2', 'a1', 'a3'])
    })
})

describe('canonicalizeFeatureLayerOrder', () => {
    const assetIds = ['a1', 'a2']

    it('groups an interleaved asset/built-in/asset state into one contiguous band', () => {
        const layers = [{sourceId: 'aoi'}, {sourceId: 'a1'}, {sourceId: 'legend'}, {sourceId: 'a2'}]
        const result = canonicalizeFeatureLayerOrder(layers, assetIds)
        expect(result.map(({sourceId}) => sourceId)).toEqual(['aoi', 'a1', 'a2', 'legend'])
    })

    it('preserves built-in and asset relative order and is idempotent', () => {
        const layers = [{sourceId: 'a1'}, {sourceId: 'legend'}, {sourceId: 'a2'}, {sourceId: 'labels'}]
        const once = canonicalizeFeatureLayerOrder(layers, assetIds)
        expect(once.map(({sourceId}) => sourceId)).toEqual(['a1', 'a2', 'legend', 'labels'])
        const twice = canonicalizeFeatureLayerOrder(once, assetIds)
        expect(twice.map(({sourceId}) => sourceId)).toEqual(['a1', 'a2', 'legend', 'labels'])
    })

    it('returns already-contiguous state unchanged (by value)', () => {
        const layers = [{sourceId: 'aoi'}, {sourceId: 'a1'}, {sourceId: 'a2'}, {sourceId: 'legend'}]
        expect(canonicalizeFeatureLayerOrder(layers, assetIds)).toEqual(layers)
    })
})

describe('reorderAssetsByPointer', () => {
    const centers = {a1: 10, a2: 20, a3: 30}

    it('moves a dragged asset up to the pointer position', () => {
        expect(reorderAssetsByPointer({assetIds: ['a1', 'a2', 'a3'], draggedId: 'a3', pointerY: 5, centers}))
            .toEqual(['a3', 'a1', 'a2'])
    })

    it('moves a dragged asset down between rows', () => {
        expect(reorderAssetsByPointer({assetIds: ['a1', 'a2', 'a3'], draggedId: 'a1', pointerY: 25, centers}))
            .toEqual(['a2', 'a1', 'a3'])
    })

    it('keeps the previous order when there is no target (pointerY null)', () => {
        expect(reorderAssetsByPointer({assetIds: ['a1', 'a2', 'a3'], draggedId: 'a1', pointerY: null, centers}))
            .toEqual(['a1', 'a2', 'a3'])
    })

    it('returns only the given asset ids (never introduces built-ins)', () => {
        const result = reorderAssetsByPointer({assetIds: ['a1', 'a2'], draggedId: 'a2', pointerY: 5, centers})
        expect(result).toEqual(['a2', 'a1'])
    })
})
