import {beforeAll, describe, expect, it, vi} from 'vitest'

import {getImageLayerSource} from './imageLayerSourceRegistry'
import {registerImageLayerSources} from './imageLayerSources'

// The presentation sources carry translated descriptions, and `msg` needs an intl instance no test mounts.
vi.mock('~/translate', () => ({
    msg: key => (Array.isArray(key) ? key.join('.') : key)
}))

const ASSET = 'projects/p/assets/folder/my_asset'

const assetSource = sourceConfig =>
    getImageLayerSource({source: {id: 's1', type: 'Asset', sourceConfig}})

describe('Asset image layer source display label', () => {
    beforeAll(() => registerImageLayerSources())

    it('shows only the basename for a legacy source saved without a label, keeping the full asset id internally', () => {
        const {description, layerComponent} = assetSource({asset: ASSET, metadata: {}})
        expect(description).toBe('my_asset')
        // The renderer/API still receives the full EE asset id.
        expect(layerComponent.props.source.sourceConfig.asset).toBe(ASSET)
    })

    it('uses an explicit label for display while keeping the full asset id internally', () => {
        const {description, layerComponent} = assetSource({asset: ASSET, label: 'Friendly name', metadata: {}})
        expect(description).toBe('Friendly name')
        expect(layerComponent.props.source.sourceConfig.asset).toBe(ASSET)
    })
})

// A characterization guard for the current presentation projection, taken through the public registry seam rather
// than the private helper behind it. Palette, Legend and Values are derived from the stored visualization's type.
// Whether that visualization currently has an image to describe is handled separately by FeatureLayers.
describe.each(['Recipe', 'Asset'])('%s presentation feature layer sources', type => {
    beforeAll(() => registerImageLayerSources())

    const presentationTypes = visParams => {
        const {getFeatureLayerSources} = getImageLayerSource({
            recipe: {id: 'recipe-1', type: 'SYNTHETIC'},
            source: {id: 's1', type, sourceConfig: {recipeId: 'recipe-1', asset: ASSET, metadata: {}}},
            layerConfig: {visParams}
        })
        return getFeatureLayerSources().map(({type}) => type)
    }

    it('offers a Palette for a continuous visualization', () => {
        expect(presentationTypes({type: 'continuous', bands: ['ndvi']})).toEqual(['Palette'])
    })

    it('offers a Legend for a categorical visualization', () => {
        expect(presentationTypes({type: 'categorical', bands: ['class']})).toEqual(['Legend'])
    })

    it('offers Values for an rgb visualization', () => {
        expect(presentationTypes({type: 'rgb', bands: ['red', 'green', 'blue']})).toEqual(['Values'])
    })

    it('offers Values for an hsv visualization', () => {
        expect(presentationTypes({type: 'hsv', bands: ['h', 's', 'v']})).toEqual(['Values'])
    })

    it('offers no presentation once the visualization has been cleared', () => {
        expect(presentationTypes(null)).toEqual([])
    })
})
