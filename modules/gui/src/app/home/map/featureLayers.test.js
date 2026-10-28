import {describe, expect, it, vi} from 'vitest'

// Palette, Legend and Values describe the image layer being shown - they read its visParams straight out of the
// store. With no image layer on the map there is nothing for them to describe, and they would otherwise keep
// annotating an image the map is refusing to draw.
//
// Suppression happens here, at render, and nowhere else. The persisted entry and its enabled preference are the
// user's, and the layer is coming back; erasing either to fix a display problem would destroy state that a source
// change restores. Every other feature layer - Labels, AOI, table assets - is independent of the image layer and
// keeps rendering.
//
// `compose` is mocked to the identity, so the exported components are the plain ones. Nothing renders: the
// function component is called and the elements it returns are inspected.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

const {FeatureLayers} = await import('./featureLayers')
const {MapAreaLayout} = await import('./mapAreaLayout')

const SOURCES = [
    {id: 'aoi', type: 'Aoi'},
    {id: 'labels', type: 'Labels'},
    {id: 'table', type: 'EETableAsset'},
    {id: 'palette', type: 'Palette'},
    {id: 'legend', type: 'Legend'},
    {id: 'values', type: 'Values'}
]

const IMAGE_LAYER = {addToMap$: () => {}}

const rendered = ({imageLayer, featureLayers}) =>
    FeatureLayers({featureLayerSources: SOURCES, featureLayers, imageLayer, map: {}})
        .filter(Boolean)
        .map(({props: {source: {type}}}) => type)

const entries = sourceIds => sourceIds.map(sourceId => ({sourceId}))

describe('feature layers with an image layer on the map', () => {
    it('renders the presentation layer alongside the independent ones', () => {
        expect(rendered({
            imageLayer: IMAGE_LAYER,
            featureLayers: entries(['aoi', 'labels', 'palette'])
        })).toEqual(['Aoi', 'Labels', 'Palette'])
    })

    it.each(['palette', 'legend', 'values'])('renders %s', sourceId => {
        expect(rendered({imageLayer: IMAGE_LAYER, featureLayers: entries([sourceId])})).toHaveLength(1)
    })
})

describe('feature layers with no image layer on the map', () => {
    it.each([['palette', 'Palette'], ['legend', 'Legend'], ['values', 'Values']])(
        'suppresses %s', sourceId => {
            expect(rendered({imageLayer: null, featureLayers: entries([sourceId])})).toEqual([])
        }
    )

    it('keeps rendering the feature layers that do not describe an image', () => {
        expect(rendered({
            imageLayer: null,
            featureLayers: entries(['aoi', 'labels', 'table', 'palette'])
        })).toEqual(['Aoi', 'Labels', 'EETableAsset'])
    })

    it('leaves the persisted entries and their enabled preference untouched', () => {
        const featureLayers = [{sourceId: 'aoi'}, {sourceId: 'palette', disabled: false, layerConfig: {a: 1}}]
        const before = JSON.parse(JSON.stringify(featureLayers))

        rendered({imageLayer: null, featureLayers})

        expect(featureLayers).toEqual(before)
    })

    // A disabled presentation layer is already withheld; suppression must not resurrect it.
    it('still withholds a presentation layer the user disabled', () => {
        expect(rendered({
            imageLayer: null,
            featureLayers: [{sourceId: 'palette', disabled: true}]
        })).toEqual([])
    })
})

describe('the map area layout', () => {
    const layoutFor = layer =>
        new MapAreaLayout({
            mapArea: {area: 'center'},
            areas: {center: {featureLayers: []}},
            map: {},
            layer
        }).render()

    const featureLayersOf = layout =>
        layout.props.children.find(({type}) => type === FeatureLayers)

    it('hands the active image layer to the feature layers', () => {
        expect(featureLayersOf(layoutFor(IMAGE_LAYER)).props.imageLayer).toBe(IMAGE_LAYER)
    })

    it('tells them when there is none', () => {
        expect(featureLayersOf(layoutFor(null)).props.imageLayer).toBe(null)
    })

    // Suppression is a rendering decision. The persisted list is where the user's ordering and enabled choices
    // live, and pruning it to hide a layer would discard both for good.
    it('does not prune the presentation entry from the persisted list when there is no image layer', () => {
        const dispatched = []
        const featureLayers = [
            {sourceId: 'aoi'}, {sourceId: 'table'}, {sourceId: 'labels'},
            {sourceId: 'palette', disabled: false}, {sourceId: 'legend'}, {sourceId: 'values'}
        ]
        const instance = new MapAreaLayout({
            mapArea: {area: 'center'},
            areas: {center: {featureLayers}},
            featureLayerSources: SOURCES,
            recipeActionBuilder: () => ({
                set: (_path, value) => ({dispatch: () => dispatched.push(value)})
            }),
            map: {},
            layer: null
        })

        instance.componentDidMount()

        expect(dispatched).toEqual([])
    })
})
