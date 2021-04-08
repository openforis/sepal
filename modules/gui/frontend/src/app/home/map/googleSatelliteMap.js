import {MapAreaLayout} from './mapAreaLayout'
import GoogleSatelliteLayer from './googleSatelliteLayer'
import PropTypes from 'prop-types'
import React from 'react'

export class GoogleSatelliteMap extends React.Component {
    render() {
        const {map} = this.props
        const layer = new GoogleSatelliteLayer({map, layerIndex: 0})
        return (
            <MapAreaLayout
                layer={layer}
                map={map}
            />
        )
    }
}

GoogleSatelliteMap.propTypes = {
    map: PropTypes.object
}
