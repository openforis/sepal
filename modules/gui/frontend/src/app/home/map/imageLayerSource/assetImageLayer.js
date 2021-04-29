import {MapAreaLayout} from '../mapAreaLayout'
import {VisualizationSelector} from './visualizationSelector'
import EarthEngineLayer from '../earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'

export class AssetImageLayer extends React.Component {
    render() {
        const {map} = this.props
        return (
            <MapAreaLayout
                layer={this.createLayer()}
                form={this.renderImageLayerForm()}
                map={map}
            />
        )
    }

    renderImageLayerForm() {
        const {source, layerConfig = {}} = this.props
        const recipe = {
            type: 'ASSET',
            id: source.sourceConfig.asset
        }
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }

    createLayer() {
        const {layerConfig, map, source: {sourceConfig: {asset}}} = this.props
        return map && layerConfig && layerConfig.visParams
            ? EarthEngineLayer.fromAsset({asset, layerConfig, map})
            : null
    }
}

AssetImageLayer.propTypes = {
    source: PropTypes.any.isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
