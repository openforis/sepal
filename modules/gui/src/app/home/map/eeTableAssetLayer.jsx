import PropTypes from 'prop-types'

import {EETableLayer} from './eeTableLayer'
import {resolveFeatureLayerStyle} from './featureLayerStyle'

// Renders a generic Earth Engine FeatureCollection/table asset as a feature overlay. Tiles are rendered
// server-side via EETableLayer/eeTableMap$ from the asset id - features are never fetched into browser
// memory. Style comes from the per-area layerConfig, falling back to the source default. Whole-layer
// opacity is applied client-side by the tile overlay, so it's kept out of the server style payload.
export const EETableAssetLayer = ({source, layerConfig, layerIndex, map}) => {
    const {asset} = source.sourceConfig
    const filter = layerConfig?.filter
    const {opacity, ...style} = resolveFeatureLayerStyle({layerConfig, source})
    return (
        <EETableLayer
            id={source.id}
            map={map}
            tableId={asset}
            style={style}
            featureFilter={filter}
            opacity={opacity}
            layerIndex={layerIndex}
        />
    )
}

EETableAssetLayer.propTypes = {
    layerConfig: PropTypes.object,
    layerIndex: PropTypes.number,
    map: PropTypes.any,
    source: PropTypes.object
}
