import {canonicalizeFeatureLayerOrder, isDataFeatureLayer, isPresentationFeatureLayer, reorderDataLayersByPointer, toDisplayedFeatureLayers, toPersistedDataOrder, withFeatureLayerDisabled, withReorderedDataLayers} from './featureLayerOrder'

const ids = layers => layers.map(({sourceId}) => sourceId)

// Every feature layer type that exists, one source each, deliberately in an order no band would produce.
const allSources = () => [
    {id: 'legend', type: 'Legend'},
    {id: 'a1', type: 'EETableAsset'},
    {id: 'labels', type: 'Labels'},
    {id: 'aoi', type: 'Aoi'},
    {id: 'sceneAreas', type: 'SceneAreas'},
    {id: 'a2', type: 'EETableAsset'},
    {id: 'referenceData', type: 'ReferenceData'},
    {id: 'palette', type: 'Palette'},
    {id: 'values', type: 'Values'}
]

const sourcesOf = (...types) => types.map((type, index) => ({id: `s${index}`, type}))

const featureLayers = () => [
    {sourceId: 'aoi'},
    {sourceId: 'labels', disabled: true},
    {sourceId: 'a1', layerConfig: {style: {colorMode: 'ONE_COLOR', color: '#111'}}},
    {sourceId: 'a2', layerConfig: {style: {colorMode: 'ONE_COLOR', color: '#222'}}},
    {sourceId: 'a3', layerConfig: {style: {colorMode: 'ONE_COLOR', color: '#333'}}}
]

const dataSources = () => [
    {id: 'aoi', type: 'Aoi'},
    {id: 'labels', type: 'Labels'},
    {id: 'a1', type: 'EETableAsset'},
    {id: 'a2', type: 'EETableAsset'},
    {id: 'a3', type: 'EETableAsset'}
]

describe('feature layer roles', () => {
    it('classifies the aoi and asset overlays as the draggable data band', () => {
        expect(['Aoi', 'EETableAsset'].map(isDataFeatureLayer)).toEqual([true, true])
        expect(['Labels', 'ReferenceData', 'SceneAreas', 'Legend'].map(isDataFeatureLayer))
            .toEqual([false, false, false, false])
    })

    it('classifies legend, palette and values as presentation rather than stack rows', () => {
        expect(['Legend', 'Palette', 'Values'].map(isPresentationFeatureLayer)).toEqual([true, true, true])
        expect(['Aoi', 'EETableAsset', 'Labels', 'ReferenceData', 'SceneAreas'].map(isPresentationFeatureLayer))
            .toEqual([false, false, false, false, false])
    })
})

describe('withFeatureLayerDisabled', () => {
    it('flips a single entry and preserves order', () => {
        const result = withFeatureLayerDisabled(featureLayers(), 'aoi', true)
        expect(ids(result)).toEqual(['aoi', 'labels', 'a1', 'a2', 'a3'])
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

describe('withReorderedDataLayers', () => {
    const dataIds = ['aoi', 'a1', 'a2', 'a3']

    it('reorders the aoi together with the assets in one band', () => {
        const result = withReorderedDataLayers(featureLayers(), dataIds, ['a3', 'aoi', 'a1', 'a2'])
        expect(ids(result)).toEqual(['a3', 'aoi', 'a1', 'a2', 'labels'])
    })

    it('reorders only data entries and keeps fixed rows in place', () => {
        const result = withReorderedDataLayers(featureLayers(), ['a1', 'a2', 'a3'], ['a3', 'a1', 'a2'])
        expect(ids(result)).toEqual(['aoi', 'labels', 'a3', 'a1', 'a2'])
    })

    it('groups data entries into a contiguous band, keeping fixed rows in relative order', () => {
        const layers = [{sourceId: 'a1'}, {sourceId: 'labels'}, {sourceId: 'a2'}]
        const result = withReorderedDataLayers(layers, ['a1', 'a2'], ['a2', 'a1'])
        expect(ids(result)).toEqual(['a2', 'a1', 'labels'])
    })

    it('preserves each data entry (and its layerConfig) by reference across reorder', () => {
        const input = featureLayers()
        const result = withReorderedDataLayers(input, ['a1', 'a2', 'a3'], ['a3', 'a1', 'a2'])
        expect(result[2]).toBe(input[4]) // a3
        expect(result[3]).toBe(input[2]) // a1
        expect(result[0]).toBe(input[0]) // aoi untouched
        expect(result[2].layerConfig).toEqual({style: {colorMode: 'ONE_COLOR', color: '#333'}})
    })

    it('appends data entries omitted from the desired order in their prior order', () => {
        const result = withReorderedDataLayers(featureLayers(), ['a1', 'a2', 'a3'], ['a3'])
        expect(ids(result)).toEqual(['aoi', 'labels', 'a3', 'a1', 'a2'])
    })

    it('ignores unknown/duplicate ids in the desired order', () => {
        const result = withReorderedDataLayers(featureLayers(), ['a1', 'a2', 'a3'], ['a2', 'nope', 'a2', 'aoi', 'a1'])
        expect(ids(result)).toEqual(['aoi', 'labels', 'a2', 'a1', 'a3'])
    })
})

describe('canonicalizeFeatureLayerOrder', () => {
    it('sorts every current type into its band, bottom to top', () => {
        const layers = allSources().map(({id}) => ({sourceId: id}))
        const result = canonicalizeFeatureLayerOrder(layers, allSources())
        expect(ids(result)).toEqual([
            'a1', 'aoi', 'a2', // data band, in the order it was persisted in
            'labels', 'referenceData', 'sceneAreas', // fixed rows, in render order
            'legend', 'palette', 'values' // presentation, parked above the stack
        ])
    })

    it('displays the fixed rows as scene areas, reference data, labels, then the data band', () => {
        const layers = allSources().map(({id}) => ({sourceId: id}))
        const displayed = toDisplayedFeatureLayers(canonicalizeFeatureLayerOrder(layers, allSources()))
        const stack = ids(displayed).filter(id => !['legend', 'palette', 'values'].includes(id))
        expect(stack).toEqual(['sceneAreas', 'referenceData', 'labels', 'a2', 'aoi', 'a1'])
    })

    it('keeps a moved aoi where the user put it', () => {
        const moved = [{sourceId: 'a1'}, {sourceId: 'aoi'}, {sourceId: 'a2'}, {sourceId: 'labels'}]
        const result = canonicalizeFeatureLayerOrder(moved, dataSources())
        expect(ids(result)).toEqual(['a1', 'aoi', 'a2', 'labels'])
    })

    it('leaves a late-added aoi wherever it was appended within the band', () => {
        const layers = [{sourceId: 'a1'}, {sourceId: 'a2'}, {sourceId: 'aoi'}]
        const result = canonicalizeFeatureLayerOrder(layers, dataSources())
        expect(ids(result)).toEqual(['a1', 'a2', 'aoi'])
    })

    it('groups an interleaved data/fixed/data state into one contiguous band', () => {
        const layers = [{sourceId: 'aoi'}, {sourceId: 'a1'}, {sourceId: 'labels'}, {sourceId: 'a2'}]
        const result = canonicalizeFeatureLayerOrder(layers, dataSources())
        expect(ids(result)).toEqual(['aoi', 'a1', 'a2', 'labels'])
    })

    it('is idempotent', () => {
        const layers = allSources().map(({id}) => ({sourceId: id}))
        const once = canonicalizeFeatureLayerOrder(layers, allSources())
        expect(canonicalizeFeatureLayerOrder(once, allSources())).toEqual(once)
    })

    it('returns already-canonical state unchanged (by value)', () => {
        const layers = [{sourceId: 'aoi'}, {sourceId: 'a1'}, {sourceId: 'labels'}]
        expect(canonicalizeFeatureLayerOrder(layers, dataSources())).toEqual(layers)
    })

    it('preserves disabled flags and layerConfig', () => {
        const layers = [
            {sourceId: 'labels', disabled: true},
            {sourceId: 'a1', layerConfig: {style: {color: '#111'}}},
            {sourceId: 'aoi', disabled: false}
        ]
        const result = canonicalizeFeatureLayerOrder(layers, dataSources())
        expect(result).toEqual([
            {sourceId: 'a1', layerConfig: {style: {color: '#111'}}},
            {sourceId: 'aoi', disabled: false},
            {sourceId: 'labels', disabled: true}
        ])
    })

    it('keeps an unclassified type in the stack rather than dropping it', () => {
        const layers = [{sourceId: 's1'}, {sourceId: 's0'}]
        const result = canonicalizeFeatureLayerOrder(layers, sourcesOf('Aoi', 'SomethingNew'))
        expect(ids(result)).toEqual(['s0', 's1'])
    })
})

describe('reorderDataLayersByPointer', () => {
    const centers = {a1: 10, aoi: 20, a2: 30}

    it('moves a dragged data layer up to the pointer position', () => {
        expect(reorderDataLayersByPointer({dataIds: ['a1', 'aoi', 'a2'], draggedId: 'a2', pointerY: 5, centers}))
            .toEqual(['a2', 'a1', 'aoi'])
    })

    it('moves the aoi like any other data layer', () => {
        expect(reorderDataLayersByPointer({dataIds: ['a1', 'aoi', 'a2'], draggedId: 'aoi', pointerY: 5, centers}))
            .toEqual(['aoi', 'a1', 'a2'])
    })

    it('keeps the previous order when there is no target (pointerY null)', () => {
        expect(reorderDataLayersByPointer({dataIds: ['a1', 'aoi', 'a2'], draggedId: 'a1', pointerY: null, centers}))
            .toEqual(['a1', 'aoi', 'a2'])
    })

    it('returns only the given data ids (never introduces a fixed row)', () => {
        const result = reorderDataLayersByPointer({dataIds: ['a1', 'aoi'], draggedId: 'aoi', pointerY: 5, centers})
        expect(result).toEqual(['aoi', 'a1'])
    })
})

describe('display/persist direction', () => {
    const layers = (...sourceIds) => sourceIds.map(sourceId => ({sourceId}))

    it('displays persisted bottom-to-top layers top-to-bottom', () => {
        expect(ids(toDisplayedFeatureLayers(layers('bottom', 'middle', 'top'))))
            .toEqual(['top', 'middle', 'bottom'])
    })

    it('persists displayed top-to-bottom data ids bottom-to-top', () => {
        expect(toPersistedDataOrder(['top', 'middle', 'bottom']))
            .toEqual(['bottom', 'middle', 'top'])
    })

    it('round-trips a persisted order through the display order', () => {
        const persisted = layers('aoi', 'a1', 'a2')
        expect(toPersistedDataOrder(ids(toDisplayedFeatureLayers(persisted)))).toEqual(ids(persisted))
    })

    it('leaves its input untouched', () => {
        const persisted = layers('bottom', 'middle', 'top')
        const displayedIds = ['top', 'middle', 'bottom']
        toDisplayedFeatureLayers(persisted)
        toPersistedDataOrder(displayedIds)
        expect(ids(persisted)).toEqual(['bottom', 'middle', 'top'])
        expect(displayedIds).toEqual(['top', 'middle', 'bottom'])
    })

    it('persists a drag of the aoi through the data band, leaving the fixed rows in place', () => {
        const dataIds = ['aoi', 'a1', 'a2']
        const persisted = layers('aoi', 'a1', 'a2', 'labels')
        const displayedDataIds = ids(toDisplayedFeatureLayers(persisted)).filter(id => dataIds.includes(id))
        expect(displayedDataIds).toEqual(['a2', 'a1', 'aoi'])
        // Rows are 20px apart top-to-bottom; drag the aoi from the bottom of the band to the top.
        const centers = {a2: 10, a1: 30, aoi: 50}
        const dragged = reorderDataLayersByPointer({dataIds: displayedDataIds, draggedId: 'aoi', pointerY: 5, centers})
        expect(dragged).toEqual(['aoi', 'a2', 'a1'])
        const result = withReorderedDataLayers(persisted, dataIds, toPersistedDataOrder(dragged))
        expect(ids(result)).toEqual(['a1', 'a2', 'aoi', 'labels'])
    })
})
