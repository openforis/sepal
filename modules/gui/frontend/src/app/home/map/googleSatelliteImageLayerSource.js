import {MapAreaLayout} from './mapAreaLayout'
import GoogleSatelliteLayer from './googleSatelliteLayer'
import PropTypes from 'prop-types'
import React from 'react'

export class GoogleSatelliteImageLayerSource extends React.Component {
    render() {
        const {output} = this.props
        switch (output) {
        case 'LAYER': return this.renderLayer()
        case 'DESCRIPTION': return this.renderDescription()
        default: throw Error(`Unsupported output type: ${output}`)
        }
    }

    renderDescription() {
        // TODO: Use messages
        return <React.Fragment>{'Google High-res Satellite imagery'}</React.Fragment>
    }

    renderLayer() {
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
    output: PropTypes.oneOf(['LAYER', 'DESCRIPTION']).isRequired,
    map: PropTypes.object
}
