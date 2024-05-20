import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {getAvailableBands} from './bands'
import {hasTrainingData} from './classificationRecipe'
import {getPreSetVisualizations} from './visualizations'

const defaultLayerConfig = {
    panSharpen: false
}

class _ClassificationImageLayer extends React.Component {
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
        const options = this.hasLegend()
            ? [{
                label: msg('process.classification.layers.imageLayer.preSets'),
                options: preSetOptions
            }]
            : []
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={options}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }

    hasLegend() {
        const {recipe} = this.props
        return !_.isEmpty(selectFrom(recipe, 'model.legend.entries'))
    }

    canRender() {
        const {recipe} = this.props
        const inputImagery = selectFrom(recipe, ['model.inputImagery.images']) || []
        return inputImagery.length && hasTrainingData(recipe)
    }
}

export const ClassificationImageLayer = compose(
    _ClassificationImageLayer
)

ClassificationImageLayer.defaultProps = {
    layerConfig: defaultLayerConfig
}

ClassificationImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
