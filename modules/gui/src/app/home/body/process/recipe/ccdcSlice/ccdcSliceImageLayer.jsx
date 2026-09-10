import PropTypes from 'prop-types'
import React from 'react'

import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {withMapArea} from '~/app/home/map/mapAreaContext'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {msg} from '~/translate'

import {preSetVisualizations} from './ccdcSliceRecipe'

const defaultLayerConfig = {
    panSharpen: false
}

class _CCDCSliceImageLayer extends React.Component {
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
        const options = [{
            label: msg('process.classification.layers.imageLayer.preSets'),
            options: preSetVisualizations(recipe).map(visParams => ({
                value: visParams.id || visParams.bands.join(','),
                label: visParams.bands.join(', '),
                visParams
            }))
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

export const CCDCSliceImageLayer = compose(
    _CCDCSliceImageLayer,
    withMapArea(),
    asFunctionalComponent({
        layerConfig: defaultLayerConfig
    })
)

CCDCSliceImageLayer.propTypes = {
    currentRecipe: PropTypes.object.isRequired,
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
