import {MapAreaLayout} from './mapAreaLayout'
import {compose} from '../../../compose'
import {withMapContext} from './mapContext'
import PropTypes from 'prop-types'
import React from 'react'
import WMTSLayer from './wmtsLayer'

const defaultLayerConfig = {
    dateRange: '2019-12_2020-05',
    proc: 'rgb'
}

class _PlanetMap extends React.Component {
    render() {
        const {layerConfig: {dateRange, proc} = defaultLayerConfig, map, planetApiKey, mapContext: {norwayPlanetApiKey}} = this.props
        const layer = new WMTSLayer({
            map,
            urlTemplate: `https://tiles0.planet.com/basemaps/v1/planet-tiles/planet_medres_normalized_analytic_${dateRange}_mosaic/gmap/{z}/{x}/{y}.png?api_key=${planetApiKey || norwayPlanetApiKey}&proc=${proc}&color=auto`
        })
        return (
            <MapAreaLayout
                form={null}
                layer={layer}
                map={map}
            />
        )
    }
}

export const PlanetMap = compose(
    _PlanetMap,
    withMapContext()
)

PlanetMap.propTypes = {
    layerConfig: PropTypes.object,
    map: PropTypes.object,
    planetApiKey: PropTypes.string
}
