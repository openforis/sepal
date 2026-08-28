import {defineRecipeType} from '../defineRecipeType.js'
import {intrinsicImageOutput} from '../output/transformation.js'
import {fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'

// CCDC's direct sources, from what its Earth Engine implementation reads:
//
//   model.aoi      clips the segments image and filters the collection (lib/js/ee/src/timeSeries/ccdc.js)
//   model.sources  the collection submodel every collection-backed recipe shares
//                  (lib/js/ee/src/timeSeries/collection.js)

// CCDC's bands are a property of the running image, so they are observed rather than listed here. The
// observed names and their order are carried through into the output schema unchanged; what does not depend
// on them is the policy. Every band exports with `sample`: modules/task/src/tasks/ccdcAssetExport.js and
// lib/js/ee/src/timeSeries/temporalSegmentation.js both set {'.default': 'sample'}, because its array bands
// cannot be pyramided by averaging. Selecting a policy per name would be inferring output behavior from the
// model instead of declaring it.
//
// The GUI's `noImageOutput: true` does not contradict this. It disables the generic GUI image-export path
// because CCDC exports through its own ccdc.GEE task, not because the image has no output schema.

export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

export default defineRecipeType({
    type: 'CCDC',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromCollectionSources(model)
    ],
    imageOutput: intrinsicImageOutput({
        derive: ({observation}) => ({
            bands: observation.bandNames.map(name => ({name, pyramidingPolicy: 'sample'})),
            evidence: []
        })
    })
})
