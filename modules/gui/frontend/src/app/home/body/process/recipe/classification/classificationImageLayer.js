import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {VisualizationSelector} from 'app/home/map/imageLayerSource/visualizationSelector'
import {compose} from 'compose'
import {getAllVisualizations, hasTrainingData, preSetVisualizationOptions, supportProbability} from './classificationRecipe'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import {withRecipeLayer} from '../withRecipeLayer'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const defaultLayerConfig = {
    panSharpen: false
}

class _ClassificationImageLayer extends React.Component {
    render() {
        const {layer, map} = this.props
        return (
            <React.Fragment>
                <MapAreaLayout
                    layer={this.canRender() ? layer : null}
                    form={this.renderImageLayerForm()}
                    map={map}
                />
            </React.Fragment>
        )
    }

    renderImageLayerForm() {
        const {recipe, source, layerConfig = {}} = this.props
        const options = this.hasLegend()
            ? [{
                label: msg('process.classification.layers.imageLayer.preSets'),
                options: preSetVisualizationOptions(recipe)
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

    componentDidMount() {
        const {recipe, layerConfig: {visParams}} = this.props
        if (!visParams && this.hasLegend()) {
            this.selectVisualization(getAllVisualizations(recipe)[0])
        }
    }

    componentDidUpdate(prevProps) {
        const {layerConfig: {visParams: prevVisParams}} = prevProps
        const {recipe} = this.props
        const allVisualizations = getAllVisualizations(recipe)
        if (prevVisParams) {
            const visParams = allVisualizations.find(({id, bands}) =>
                _.isEqual([id, bands], [prevVisParams.id, prevVisParams.bands])
            )
            if (!visParams) {
                this.selectVisualization(getAllVisualizations(recipe)[0])
            } else if (!_.isEqual(visParams, prevVisParams)) {
                this.selectVisualization(visParams)
            }
        } else {
            allVisualizations.length && this.selectVisualization(allVisualizations[0])
        }
    }

    selectVisualization(visParams) {
        const {mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams})
    }
}

const toDataTypes = recipe => {
    const legend = selectFrom(recipe, 'model.legend')
    if (!recipe.ui.initialized || !legend.entries.length) {
        return {}
    }
    const entries = _.sortBy(legend.entries, 'value')
    const classifierType = selectFrom(recipe, 'model.classifier.type')
    const min = entries[0].value
    const max = _.last(entries).value
    const dataTypes = {};
    [
        {band: 'class', precision: 'int', min, max},
        {band: 'regression', precision: 'float', min, max},
        {band: 'class_probability', precision: 'int', min: 0, max: 100},
        ...legend.entries.map(({value}) => supportProbability(classifierType) && {
            band: `probability_${value}`, precision: 'int', min: 0, max: 100
        })
    ].filter(o => o).forEach(({band, precision, min, max}) => dataTypes[band] = {precision, min, max})
    return dataTypes
}

export const ClassificationImageLayer = compose(
    _ClassificationImageLayer,
    withMapAreaContext(),
    withRecipeLayer({toDataTypes})
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
