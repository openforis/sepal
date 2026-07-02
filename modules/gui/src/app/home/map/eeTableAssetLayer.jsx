import PropTypes from 'prop-types'

import {EETableLayer} from './eeTableLayer'

// Renders a generic Earth Engine FeatureCollection/table asset as a feature overlay. Tiles are
// rendered server-side via EETableLayer/eeTableMap$ from the asset id - features are never fetched
// into browser memory. Styling is fixed for now; a persisted per-layer styling model (color, opacity,
// etc.) is deferred until the design is settled.
const COLOR = '#00ffff'
const FILL_COLOR = '#00ffff80'
const POINT_SIZE = 4
const WIDTH = 1

export const EETableAssetLayer = ({source, layerIndex, map}) => {
    const {asset} = source.sourceConfig
    return (
        <EETableLayer
            id={source.id}
            map={map}
            tableId={asset}
            color={COLOR}
            fillColor={FILL_COLOR}
            pointSize={POINT_SIZE}
            width={WIDTH}
            layerIndex={layerIndex}
            watchedProps={{asset}}
        />
    )
}

EETableAssetLayer.propTypes = {
    layerIndex: PropTypes.number,
    map: PropTypes.any,
    source: PropTypes.object
}
