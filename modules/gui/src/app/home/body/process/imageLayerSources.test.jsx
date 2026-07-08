import {beforeAll, describe, expect, it} from 'vitest'

import {getImageLayerSource} from './imageLayerSourceRegistry'
import {registerImageLayerSources} from './imageLayerSources'

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
