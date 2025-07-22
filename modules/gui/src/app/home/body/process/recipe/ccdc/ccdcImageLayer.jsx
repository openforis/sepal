import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {withMapArea} from '~/app/home/map/mapAreaContext'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {msg} from '~/translate'

import {getAvailableBands} from './bands'
import {getPreSetVisualizations} from './visualizations'

const defaultLayerConfig = {
    visualizationType: 'COUNT'
}

class _CCDCImageLayer extends React.Component {
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
        const availableBands = getAvailableBands(recipe)
        const preSetOptions = getPreSetVisualizations(recipe)
            .filter(({bands}) => availableBands[bands[0]])
            .map(visParams => {
                const band = visParams.bands[0]
                return {...availableBands[band], value: band, visParams}
            })
        const options = [{
            label: msg('process.classification.layers.imageLayer.preSets'),
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

    componentDidMount() {
        const {layerConfig: {visualizationType}, mapArea: {updateLayerConfig}} = this.props

        if (!visualizationType) {
            updateLayerConfig(defaultLayerConfig)
        }
    }

}

export const CCDCImageLayer = compose(
    _CCDCImageLayer,
    withMapArea(),
    asFunctionalComponent({
        layerConfig: defaultLayerConfig
    })
)

CCDCImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
