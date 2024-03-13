import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {compose} from '~/compose'
import {getPreSetVisualizations} from './visualizations'
import {msg} from '~/translate'
import PropTypes from 'prop-types'
import React from 'react'

class _MaskingImageLayer extends React.Component {
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
        const preSetOptions = getPreSetVisualizations(recipe)
            .map(visParams => ({
                value: visParams.bands.join(', '),
                label: visParams.bands.join(', '),
                visParams
            }))
        const options = [{
            label: msg('process.masking.layers.imageLayer.preSets'),
            options: preSetOptions
        }]
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

export const MaskingImageLayer = compose(
    _MaskingImageLayer
)

MaskingImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
