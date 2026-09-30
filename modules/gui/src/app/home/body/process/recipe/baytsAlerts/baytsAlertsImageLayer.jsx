import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {withMapArea} from '~/app/home/map/mapAreaContext'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Buttons} from '~/widget/buttons'
import {Layout} from '~/widget/layout'

import {withRecipe} from '../../recipeContext'
import {layerSelection, layerVisualizations, presetVisualizations} from '../visualizations'
import {mapProducts} from './bands'
import {visualizationOptions} from './visualizations'

const defaultLayerConfig = mapProducts.defaults

const mapRecipeToProps = recipe => {
    return {
        initialized: selectFrom(recipe, 'ui.initialized'),
        sources: selectFrom(recipe, 'model.sources')
    }
}

class _BaytsAlertsImageLayer extends React.Component {
    render() {
        const {initialized, layer, map} = this.props
        return initialized
            ? (
                <MapAreaLayout
                    layer={layer}
                    form={this.renderImageLayerForm()}
                    map={map}
                />
            )
            : null
    }

    renderImageLayerForm() {
        const {layerConfig: {visualizationType}} = this.props
        return (
            <Layout>
                {this.renderVisualizationType()}
                {visualizationType === 'alerts' ? this.renderPreviouslyConfirmed() : null}
                {visualizationType === 'alerts' ? this.renderMinConfidence() : null}
                {this.renderVisualizationSelector()}
            </Layout>
        )
    }

    renderVisualizationType() {
        const {layerConfig: {visualizationType}} = this.props
        const options = [
            {value: 'alerts', label: msg('process.baytsAlerts.imageLayerForm.visualizationType.alerts.label'), tooltip: msg('process.baytsAlerts.imageLayerForm.visualizationType.alerts.tooltip')},
            {value: 'first', label: msg('process.baytsAlerts.imageLayerForm.visualizationType.first.label'), tooltip: msg('process.baytsAlerts.imageLayerForm.visualizationType.first.tooltip')},
            {value: 'last', label: msg('process.baytsAlerts.imageLayerForm.visualizationType.last.label'), tooltip: msg('process.baytsAlerts.imageLayerForm.visualizationType.last.tooltip')}
        ]
        const selectedOption = options.find(({value}) => value === visualizationType) || {}
        return (
            <Buttons
                label={msg('process.baytsAlerts.imageLayerForm.visualizationType.label')}
                selected={selectedOption.value}
                options={options}
                onChange={visualizationType => this.selectVisualizationType(visualizationType)}
            />
        )
    }

    renderPreviouslyConfirmed() {
        const {layerConfig: {previouslyConfirmed}} = this.props
        const options = [
            {value: 'include', label: msg('process.baytsAlerts.imageLayerForm.previouslyConfirmed.include.label'), tooltip: msg('process.baytsAlerts.imageLayerForm.previouslyConfirmed.include.tooltip')},
            {value: 'exclude', label: msg('process.baytsAlerts.imageLayerForm.previouslyConfirmed.exclude.label'), tooltip: msg('process.baytsAlerts.imageLayerForm.previouslyConfirmed.exclude.tooltip')}
        ]
        const selectedOption = options.find(({value}) => value === previouslyConfirmed) || {}
        return (
            <Buttons
                label={msg('process.baytsAlerts.imageLayerForm.previouslyConfirmed.label')}
                selected={selectedOption.value}
                options={options}
                onChange={previouslyConfirmed => this.selectPreviouslyConfirmed(previouslyConfirmed)}
            />
        )
    }

    renderMinConfidence() {
        const {layerConfig: {minConfidence}} = this.props
        const options = [
            {value: 'all', label: msg('process.baytsAlerts.imageLayerForm.minConfidence.all.label'), tooltip: msg('process.baytsAlerts.imageLayerForm.minConfidence.all.tooltip')},
            {value: 'low', label: msg('process.baytsAlerts.imageLayerForm.minConfidence.low.label'), tooltip: msg('process.baytsAlerts.imageLayerForm.minConfidence.low.tooltip')},
            {value: 'high', label: msg('process.baytsAlerts.imageLayerForm.minConfidence.high.label'), tooltip: msg('process.baytsAlerts.imageLayerForm.minConfidence.high.tooltip')}
        ]
        const selectedOption = options.find(({value}) => value === minConfidence) || {}
        return (
            <Buttons
                label={msg('process.baytsAlerts.imageLayerForm.minConfidence.label')}
                selected={selectedOption.value}
                options={options}
                onChange={minConfidence => this.selectMinConfidence(minConfidence)}
            />
        )
    }

    renderVisualizationSelector() {
        const {layerConfig: {visualizationType}, recipe, source, layerConfig = {}, imageOutput: {availableBands}} = this.props
        const options = visualizationOptions(recipe, visualizationType)
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={options}
                availableBands={availableBands}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }

    componentDidMount() {
        this.reconcile()
    }

    componentDidUpdate() {
        this.reconcile()
    }

    // The layer config is completed before a style is chosen for it. A layer config saved before the alert filter
    // existed names a visualization type but no filter, and would leave the form showing nothing selected while the
    // preview applies the unfiltered default.
    reconcile() {
        const {layerConfig, mapArea: {updateLayerConfig}} = this.props
        const unstated = _.omitBy(defaultLayerConfig, (_value, field) => field in layerConfig)
        if (_.isEmpty(unstated)) {
            this.reconcileVisualization()
        } else {
            updateLayerConfig(unstated)
        }
    }

    reconcileVisualization() {
        const {recipe, imageOutput, layerConfig: {visParams}} = this.props
        const selection = layerSelection({recipe, imageOutput, visualizations: this.visualizations(), visParams})
        if (selection) {
            this.selectVisualization(selection)
        }
    }

    visualizations() {
        const {currentRecipe, recipe, source, layerConfig: {visualizationType}, imageOutput} = this.props
        return layerVisualizations({
            currentRecipe,
            recipe,
            sourceId: source.id,
            presets: presetVisualizations(visualizationOptions(recipe, visualizationType)),
            availableBands: imageOutput.availableBands
        })
    }

    selectVisualization(visParams) {
        const {layerConfig, mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({...layerConfig, visParams})
    }

    selectVisualizationType(visualizationType) {
        const {mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({visualizationType})
    }

    selectPreviouslyConfirmed(previouslyConfirmed) {
        const {mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({previouslyConfirmed})
    }

    selectMinConfidence(minConfidence) {
        const {mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({minConfidence})
    }
}

export const BaytsAlertsImageLayer = compose(
    _BaytsAlertsImageLayer,
    withMapArea(),
    withRecipe(mapRecipeToProps),
    asFunctionalComponent({
        layerConfig: defaultLayerConfig
    })
)

BaytsAlertsImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    imageOutput: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
