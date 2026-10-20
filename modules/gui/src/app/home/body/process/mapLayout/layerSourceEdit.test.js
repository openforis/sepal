import {describe, expect, it} from 'vitest'

import {editLayerSource, isEditableLayerSource, reconcileFeatureLayerConfig} from './layerSourceEdit'

describe('editing an image layer source', () => {
    it('replaces its configuration in place, keeping its identity and every area that shows it', () => {
        const layers = layersWith()

        const edited = editLayerSource({layers, sourceId: 'asset-1', sourceConfig: {asset: 'projects/p/assets/b'}})

        expect(edited.additionalImageLayerSources).toEqual([
            {id: 'recipe-1', type: 'Recipe', sourceConfig: {recipeId: 'r1'}},
            {id: 'asset-1', type: 'Asset', sourceConfig: {asset: 'projects/p/assets/b'}}
        ])
        expect(edited.areas).toEqual(layers.areas)
        expect(edited.additionalFeatureLayerSources).toBe(layers.additionalFeatureLayerSources)
    })

    it('reconciles the settings of every area showing it, and of no other', () => {
        const layers = layersWith()

        const edited = editLayerSource({
            layers,
            sourceId: 'asset-1',
            sourceConfig: {asset: 'projects/p/assets/b'},
            reconcileLayerConfig: () => undefined
        })

        expect(edited.areas.left.imageLayer).toEqual({sourceId: 'asset-1'})
        expect(edited.areas.right.imageLayer).toEqual({sourceId: 'asset-1'})
        expect(edited.areas.center.imageLayer).toBe(layers.areas.center.imageLayer)
    })

    it('leaves the layers it was given unchanged', () => {
        const layers = layersWith()
        const before = structuredClone(layers)

        editLayerSource({layers, sourceId: 'asset-1', sourceConfig: {}, reconcileLayerConfig: () => undefined})

        expect(layers).toEqual(before)
    })

    it('refuses a source that was not added by the user', () => {
        expect(() => editLayerSource({layers: layersWith(), sourceId: 'this-recipe', sourceConfig: {}}))
            .toThrow(/this-recipe/)
    })
})

describe('which layer sources can be edited', () => {
    it.each([
        ['an asset', {id: 'projects/p/assets/a', type: 'Asset', sourceConfig: {asset: 'projects/p/assets/a'}}],
        ['a recipe', {id: 'r1', type: 'Recipe', sourceConfig: {recipeId: 'r1'}}]
    ])('not one an input panel maintains for %s, which is refused rather than updated', (_case, source) => {
        const layers = {...layersWith(), additionalImageLayerSources: [source]}

        expect(isEditableLayerSource(source)).toBe(false)
        expect(() => editLayerSource({layers, sourceId: source.id, sourceConfig: {}})).toThrow(/input panel/)
    })

    it('one added in the layout, even showing what an input panel\'s source shows', () => {
        const inputSource = {id: 'projects/p/assets/a', type: 'Asset', sourceConfig: {asset: 'projects/p/assets/a'}}
        const layoutSource = {id: 'asset-1', type: 'Asset', sourceConfig: {asset: 'projects/p/assets/a'}}
        const layers = {...layersWith(), additionalImageLayerSources: [inputSource, layoutSource]}

        const edited = editLayerSource({layers, sourceId: 'asset-1', sourceConfig: {asset: 'projects/p/assets/b'}})

        expect(isEditableLayerSource(layoutSource)).toBe(true)
        expect(edited.additionalImageLayerSources).toEqual([
            inputSource,
            {id: 'asset-1', type: 'Asset', sourceConfig: {asset: 'projects/p/assets/b'}}
        ])
    })

    it.each([
        ['a Planet account', {id: 'planet-1', type: 'Planet', sourceConfig: {planetApiKey: 'key'}}],
        ['a table', {id: 'ee-table:1', type: 'EETableAsset', sourceConfig: {asset: 'projects/p/assets/t1'}}]
    ])('one added in the layout for %s', (_case, source) => {
        expect(isEditableLayerSource(source)).toBe(true)
    })
})

describe('editing a feature layer source', () => {
    it('replaces its configuration in place, keeping its place in every area', () => {
        const layers = layersWith()

        const edited = editLayerSource({
            layers,
            sourceId: 'table-1',
            sourceConfig: {asset: 'projects/p/assets/t2', columns: ['class']},
            reconcileLayerConfig: reconcileFeatureLayerConfig(['class'])
        })

        expect(edited.additionalFeatureLayerSources).toEqual([
            {id: 'table-1', type: 'EETableAsset', defaultEnabled: false, sourceConfig: {asset: 'projects/p/assets/t2', columns: ['class']}}
        ])
        expect(edited.areas.center.featureLayers.map(({sourceId}) => sourceId)).toEqual(['aoi', 'table-1'])
        expect(edited.areas.center.featureLayers[1]).toEqual({sourceId: 'table-1', layerConfig: {filter: classFilter}})
        expect(edited.additionalImageLayerSources).toBe(layers.additionalImageLayerSources)
    })
})

describe('reconciling a table\'s per-area settings with its columns', () => {
    it('keeps a style and filter whose properties the table has', () => {
        const layerConfig = {style: byValue('class'), filter: classFilter}

        expect(reconcileFeatureLayerConfig(['class'])(layerConfig)).toEqual(layerConfig)
    })

    it('keeps a style that names no property', () => {
        const layerConfig = {style: {colorMode: 'ONE_COLOR', color: '#FF0000', opacity: 0.5}}

        expect(reconcileFeatureLayerConfig([])(layerConfig)).toEqual(layerConfig)
    })

    it.each([
        ['coloring by a property', {colorMode: 'COLORS_FROM_PROPERTY', colorProperty: 'color'}],
        ['coloring by value', byValue('stratum')]
    ])('drops a style %s the table lacks, keeping the filter', (_case, style) => {
        expect(reconcileFeatureLayerConfig(['class'])({style, filter: classFilter})).toEqual({filter: classFilter})
    })

    it('drops a filter on a property the table lacks, keeping the style', () => {
        const style = byValue('stratum')

        expect(reconcileFeatureLayerConfig(['stratum'])({style, filter: classFilter})).toEqual({style})
    })

    it('leaves nothing when nothing applies', () => {
        expect(reconcileFeatureLayerConfig([])({style: byValue('stratum'), filter: classFilter})).toBeUndefined()
    })
})

const classFilter = {booleanOperator: 'and', constraints: [{id: 'c1', property: 'class', operator: '=', value: 1}]}

const byValue = valueProperty => ({colorMode: 'COLORS_BY_VALUE', valueProperty, valueColors: {1: '#FF0000'}})

const layersWith = () => ({
    mode: 'grid',
    standardImageLayerSources: [{id: 'this-recipe', type: 'Recipe', sourceConfig: {recipeId: 'owner'}}],
    additionalImageLayerSources: [
        {id: 'recipe-1', type: 'Recipe', sourceConfig: {recipeId: 'r1'}},
        {id: 'asset-1', type: 'Asset', sourceConfig: {asset: 'projects/p/assets/a'}}
    ],
    additionalFeatureLayerSources: [
        {id: 'table-1', type: 'EETableAsset', defaultEnabled: false, sourceConfig: {asset: 'projects/p/assets/t1', columns: ['class', 'stratum']}}
    ],
    areas: {
        center: {
            id: 'area-c',
            imageLayer: {sourceId: 'recipe-1', layerConfig: {visParams: {bands: ['red']}}},
            featureLayers: [{sourceId: 'aoi'}, {sourceId: 'table-1', layerConfig: {style: byValue('stratum'), filter: classFilter}}]
        },
        left: {
            id: 'area-l',
            imageLayer: {sourceId: 'asset-1', layerConfig: {visParams: {bands: ['b1']}}},
            featureLayers: []
        },
        right: {
            id: 'area-r',
            imageLayer: {sourceId: 'asset-1', layerConfig: {visParams: {bands: ['b2']}}},
            featureLayers: [{sourceId: 'table-1'}]
        }
    }
})
