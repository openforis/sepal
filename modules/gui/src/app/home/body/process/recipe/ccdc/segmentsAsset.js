import _ from 'lodash'
import {map} from 'rxjs'

import {SEGMENT_BANDS} from '#sepal/recipe/type/ccdc'
import api from '~/apiRegistry'
import {toVisualizations} from '~/app/home/map/imageLayerSource/assetVisualizationParser'
import {uuid} from '~/uuid'

// A CCDC segments image stored as an Earth Engine asset, described from its metadata. CCDC owns the format,
// so both a bare asset and an asset-mosaic recipe wrapping one are described the same way here.
//
// It admits nothing and verifies nothing. Every band name matching the suffix pattern becomes a base band and
// the five known names become segment bands, whether or not what comes out describes a coherent CCDC image -
// an asset with a single `x_rmse` band yields one base band. Deciding whether an asset really carries CCDC
// segments needs typed band evidence this never looks at, array dimensionality included.
//
// Two different things come out of the same metadata and must not be confused. Band names are the only input
// to the structural fields. The visualization properties are presentation templates and contribute to none of
// them: an asset with no visualizations still yields base and segment bands, and one full of CCDC-shaped
// visualization properties yields none unless its band names say so.

export const describeSegmentsAsset$ = assetId =>
    api.gee.assetMetadata$({asset: assetId}).pipe(
        map(segmentsAssetDescription)
    )

export const segmentsAssetDescription = ({bandNames = [], properties = {}} = {}) => ({
    bands: bandNames,
    baseBands: baseBandsOf(bandNames),
    segmentBands: bandNames.filter(name => SEGMENT_BANDS.includes(name)).map(name => ({name})),
    dateFormat: properties.dateFormat,
    startDate: properties.startDate,
    endDate: properties.endDate,
    // Identified per read. Which template a saved selection means is settled where a read is compared with
    // the one before it, not here.
    visualizations: toVisualizations(properties, bandNames).map(visualization => ({...visualization, id: uuid()}))
})

const baseBandPattern = /(.*)_(coefs|intercept|slope|phase_\d|amplitude_\d|rmse|magnitude)$/

// The `_coefs` band is the physical array band. Each one stands for nine logical coefficient bands a slice
// derives from it, which is why one physical band name expands into nine measures here.
const COEFFICIENT_MEASURES = [
    'value', 'intercept', 'slope',
    'phase_1', 'amplitude_1', 'phase_2', 'amplitude_2', 'phase_3', 'amplitude_3'
]

const baseBandsOf = bandNames => {
    const bandAndMeasure = _.chain(bandNames)
        .map(bandName => bandName.match(baseBandPattern))
        .filter(match => match)
        .map(([_bandName, name, measure]) => measure === 'coefs'
            ? COEFFICIENT_MEASURES.map(measure => ({name, measure}))
            : [{name, measure}]
        )
        .flatten()
        .value()
    const byName = _.groupBy(bandAndMeasure, ({name}) => name)
    return _.chain(bandAndMeasure)
        .map(({name}) => name)
        .uniq()
        .map(name => ({name, measures: byName[name].map(({measure}) => measure)}))
        .value()
}
