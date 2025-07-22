import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {getUserDefinedVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {withMapArea} from '~/app/home/map/mapAreaContext'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {additionalVisualizations, getAllVisualizations} from './ccdcSliceRecipe'

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
        const visParamsToOption = visParams => ({
            value: visParams.id || visParams.bands.join(','),
            label: visParams.bands.join(', '),
            visParams
        })
        const visualizations = recipe.ui.initialized
            ? (selectFrom(recipe, 'model.source.visualizations') || [])
                .concat(additionalVisualizations(recipe))
            : []
        const options = [{
            label: msg('process.classification.layers.imageLayer.preSets'),
            options: visualizations.map(visParamsToOption)
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
        const {layerConfig: {visParams}} = this.props
        if (!visParams || !_.isObject(visParams)) {
            const allVisualizations = this.toAllVis()
            this.selectVisualization(allVisualizations[0])
        }
    }

    componentDidUpdate(prevProps) {
        const {layerConfig: {visParams: prevVisParams}} = prevProps
        const allVisualizations = this.toAllVis()
        if (prevVisParams) {
            const visParams = allVisualizations
                .find(({
                    id,
                    bands
                }) => id === prevVisParams.id && (prevVisParams.id || _.isEqual(bands, prevVisParams.bands)))
            if (!visParams) {
                allVisualizations.length && this.selectVisualization(allVisualizations[0])
            } else if (!_.isEqual(visParams, prevVisParams)) {
                this.selectVisualization(visParams)
            }
        } else {
            allVisualizations.length && this.selectVisualization(allVisualizations[0])
        }
    }

    toAllVis() {
        const {currentRecipe, recipe, sourceId} = this.props
        return recipe.ui.initialized
            ? [
                ...getUserDefinedVisualizations(currentRecipe, sourceId),
                ...getAllVisualizations(recipe),
            ]
            : []
    }

    selectVisualization(visParams) {
        const {layerConfig: {panSharpen}, mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams, panSharpen})
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
