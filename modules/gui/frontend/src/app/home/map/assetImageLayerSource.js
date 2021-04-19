import {MapAreaLayout} from './mapAreaLayout'
import EarthEngineLayer from './earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'

export class AssetImageLayerSource extends React.Component {
    state = {}

    render() {
        const {output} = this.props
        switch(output) {
        case 'DESCRIPTION': return this.renderDescription()
        case 'LAYER': return this.renderLayer()
        default: throw Error(`Unsupported output type: ${output}`)
        }
    }

    renderDescription() {
        const {asset} = this.props
        return <div>{asset}</div>
    }

    renderLayer() {
        const {asset, layerConfig, map} = this.props
        const layer = map
            ? EarthEngineLayer.fromAsset({asset, layerConfig, map})
            : null

        return (
            <MapAreaLayout
                layer={layer}
                form={this.renderImageLayerForm()}
                map={map}
            />
        )
    }

    renderImageLayerForm() {
        // TODO: Implement band selection
        return null
    }
}

AssetImageLayerSource.propTypes = {
    asset: PropTypes.string.isRequired,
    output: PropTypes.oneOf(['LAYER', 'DESCRIPTION']).isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
