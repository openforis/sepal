import {defineRecipeType} from '../defineRecipeType.js'
import {migrate} from '../migrate.js'
import {opticalBandEncoding} from '../optical/encoding.js'
import {selectableBands} from '../optical/opticalBands.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromAoi} from '../source/aoi.js'

// An optical mosaic composites a scene collection and clips it to its AOI
// (lib/js/ee/src/optical/mosaic.js). Its data sets are enumerated collection identifiers fixed in the
// implementation, not selections, so the AOI is its one external reference.

// An optical mosaic's own model states the collection it composited and the window it covers.
export const opticalCollectionDefaults = {
    defaultsAsset: () => null
}

// Described from the model, not observed: indexes are computed only when requested, so the composite built for an
// empty selection does not list what is available. Migrated first, as execution migrates it.
export default defineRecipeType({
    type: 'MOSAIC',
    opticalCollectionDefaults,
    directSources: model => fromAoi({model, keys: ['aoi']}),
    imageOutput: imageOutputProvider({
        describe: ({recipe}) => ({
            bands: selectableBands(migrate(recipe).model).map(name => {
                const encoding = opticalBandEncoding(name)
                return {
                    name,
                    dataType: {arrayDimensions: 0},
                    ...(encoding ? {encoding} : {})
                }
            }),
            evidence: []
        })
    })
})
