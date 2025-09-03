import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {getAvailableBands} from './bands'
import {hasTrainingData} from './regressionRecipe'
import {getPreSetVisualizations} from './visualizations'

const defaultLayerConfig = {
    panSharpen: false
}

class _RegressionImageLayer extends React.Component {
    render() {
        const {layer, map} = this.props
        return (
            <MapAreaLayout
                layer={this.canRender() ? layer : null}
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

    canRender() {
        const {recipe} = this.props
        const inputImagery = selectFrom(recipe, ['model.inputImagery.images']) || []
        return inputImagery.length && hasTrainingData(recipe)
    }
}

export const RegressionImageLayer = compose(
    _RegressionImageLayer,
    asFunctionalComponent({
        layerConfig: defaultLayerConfig
    })
)

RegressionImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
