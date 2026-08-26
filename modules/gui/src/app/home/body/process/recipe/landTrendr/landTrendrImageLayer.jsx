import PropTypes from 'prop-types'
import React from 'react'

import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {compose} from '~/compose'
import {msg} from '~/translate'

import {getAvailableBands} from './bands'
import {getPreSetVisualizations} from './visualizations'

const combinedLabels = () => ({
    'startRed,startGreen,startBlue': msg('process.landTrendr.bands.startRgb'),
    'endRed,endGreen,endBlue': msg('process.landTrendr.bands.endRgb')
})

class _LandTrendrImageLayer extends React.Component {
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
        const availableBands = getAvailableBands()
        const rgbLabels = combinedLabels()
        const preSetOptions = getPreSetVisualizations(recipe)
            .map(visParams => {
                const key = visParams.bands.join(',')
                const label = visParams.bands.length === 1
                    ? availableBands[visParams.bands[0]].label
                    : rgbLabels[key] || key
                return {value: key, label, visParams}
            })
        const options = [{
            label: msg('process.landTrendr.layers.imageLayer.preSets'),
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

export const LandTrendrImageLayer = compose(
    _LandTrendrImageLayer
)

LandTrendrImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
