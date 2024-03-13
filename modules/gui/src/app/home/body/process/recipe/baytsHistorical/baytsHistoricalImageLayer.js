import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {compose} from '~/compose'
import {visualizationOptions} from './visualizations'
import PropTypes from 'prop-types'
import React from 'react'

const defaultLayerConfig = {
    panSharpen: false
}

class _BaytsHistoricalImageLayer extends React.Component {
    render() {
        const {layer, map} = this.props
        return (
            <MapAreaLayout
                layer={layer}
                form={this.renderImageLayerForm()}
                map={map}
            />
        )
    }

    renderImageLayerForm() {
        const {recipe, source, layerConfig = {}} = this.props
        const options = visualizationOptions(recipe)
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={options}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }
}

export const BaytsHistoricalImageLayer = compose(
    _BaytsHistoricalImageLayer
)

BaytsHistoricalImageLayer.defaultProps = {
    layerConfig: defaultLayerConfig
}

BaytsHistoricalImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
