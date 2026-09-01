import _ from 'lodash'

import {toVisualizations} from '~/app/home/map/imageLayerSource/assetVisualizationParser'
import {uuid} from '~/uuid'

// Reconstructing the candidate source fields CCDC Slice needs from an Earth Engine asset's metadata.
//
// It admits nothing and verifies nothing. Every band name matching the suffix pattern is turned into base bands,
// and the five known names into segment bands, whether or not what comes out describes a coherent CCDC image -
// an asset with a single `x_rmse` band yields one base band here. Deciding whether an asset really carries CCDC
// segments needs typed band evidence this function never looks at, array dimensionality included, and belongs to
// a capability contract that does not exist yet.
//
// Two different things come out of the same metadata and must not be confused. Band names are the only input to
// the structural fields. The visualization properties are presentation templates and contribute to none of them:
// an asset with no visualizations still yields base and segment bands, and one full of CCDC-shaped visualization
// properties yields none unless its band names say so.
//
// The `_coefs` band is the physical array band. Each one stands for nine logical coefficient bands Slice derives
// from it, which is why one physical band name expands into nine band types here.
const baseBandPattern = /(.*)_(coefs|intercept|slope|phase_\d|amplitude_\d|rmse|magnitude)$/

const SEGMENT_BANDS = ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb']

export const toAssetSource = (id, metadata) => {
    const bands = metadata.bandNames
    const bandAndType = _.chain(bands)
        .map(sourceBand => sourceBand.match(baseBandPattern))
        .filter(match => match)
        .map(([_, name, bandType]) => bandType === 'coefs'
            ? ['value', 'intercept', 'slope', 'phase_1', 'amplitude_1', 'phase_2', 'amplitude_2', 'phase_3', 'amplitude_3']
                .map(bandType => ({name, bandType}))
            : [{name, bandType}]
        )
        .flatten()
        .value()
    const bandByName = _.groupBy(bandAndType, ({name}) => name)
    const baseBands = _.chain(bandAndType)
        .map(({name}) => name)
        .uniq()
        .map(name => ({name, bandTypes: bandByName[name].map(({bandType}) => bandType)}))
        .value()
    const segmentBands = bands
        .filter(name => SEGMENT_BANDS.includes(name))
        .map(name => ({name}))
    const dateFormat = metadata.properties.dateFormat
    return {
        type: 'ASSET',
        id,
        bands,
        baseBands,
        segmentBands,
        dateFormat,
        startDate: metadata.properties.startDate,
        endDate: metadata.properties.endDate,
        visualizations: toVisualizations(metadata.properties, bands)
            .map(visualization => ({...visualization, id: uuid()}))
    }
}
