import {MapAreaLayout} from '../mapAreaLayout'
import GoogleSatelliteLayer from '../googleSatelliteLayer'
import PropTypes from 'prop-types'
import React from 'react'

export class GoogleSatelliteImageLayerSource extends React.Component {
    render() {
        const {map} = this.props
        const layer = new GoogleSatelliteLayer({map})
        return (
            <MapAreaLayout
                layer={layer}
                map={map}
            />
        )
    }
}

GoogleSatelliteImageLayerSource.propTypes = {
    map: PropTypes.object
}
