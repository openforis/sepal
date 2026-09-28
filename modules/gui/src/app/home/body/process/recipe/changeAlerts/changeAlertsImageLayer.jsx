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

class _ChangeAlertsImageLayer extends React.Component {
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
                {visualizationType !== 'changes' ? this.renderMosaicType() : null}
                {this.renderVisualizationSelector()}
            </Layout>
        )
    }

    renderVisualizationType() {
        const {layerConfig: {visualizationType}} = this.props
        const options = [
            {value: 'changes', label: msg('process.changeAlerts.imageLayerForm.visualizationType.changes.label'), tooltip: msg('process.changeAlerts.imageLayerForm.visualizationType.changes.tooltip')},
            {value: 'monitoring', label: msg('process.changeAlerts.imageLayerForm.visualizationType.monitoring.label'), tooltip: msg('process.changeAlerts.imageLayerForm.visualizationType.monitoring.tooltip')},
            {value: 'calibration', label: msg('process.changeAlerts.imageLayerForm.visualizationType.calibration.label'), tooltip: msg('process.changeAlerts.imageLayerForm.visualizationType.calibration.tooltip')}
        ]
        const selectedOption = options.find(({value}) => value === visualizationType) || {}
        return (
            <Buttons
                label={msg('process.changeAlerts.imageLayerForm.visualizationType.label')}
                selected={selectedOption.value}
                options={options}
                onChange={visualizationType => this.selectVisualizationType(visualizationType)}
            />
            
        )
    }

    renderMosaicType() {
        const {layerConfig: {mosaicType}} = this.props
        const options = [
            {value: 'latest', label: msg('process.changeAlerts.imageLayerForm.mosaicType.latest.label'), tooltip: msg('process.changeAlerts.imageLayerForm.mosaicType.latest.tooltip')},
            {value: 'median', label: msg('process.changeAlerts.imageLayerForm.mosaicType.median.label'), tooltip: msg('process.changeAlerts.imageLayerForm.mosaicType.median.tooltip')}
        ]
        const selectedOption = options.find(({value}) => value === mosaicType) || {}
        return (
            <Buttons
                label={msg('process.changeAlerts.imageLayerForm.mosaicType.label')}
                selected={selectedOption.value}
                options={options}
                onChange={mosaicType => this.selectMosaicType(mosaicType)}
            />
            
        )
    }

    renderVisualizationSelector() {
        const {layerConfig: {visualizationType, mosaicType}, recipe, source, layerConfig = {}, imageOutput: {availableBands}} = this.props
        const options = visualizationOptions(recipe, visualizationType, mosaicType)
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

    // The layer config names its mode before a style is chosen for it.
    reconcile() {
        const {layerConfig: {visualizationType}, mapArea: {updateLayerConfig}} = this.props
        if (visualizationType) {
            this.reconcileVisualization()
        } else {
            updateLayerConfig(defaultLayerConfig)
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
        const {currentRecipe, recipe, source, layerConfig: {visualizationType, mosaicType}, imageOutput} = this.props
        return layerVisualizations({
            currentRecipe,
            recipe,
            sourceId: source.id,
            presets: presetVisualizations(visualizationOptions(recipe, visualizationType, mosaicType)),
            availableBands: imageOutput.availableBands
        })
    }

    selectVisualization(visParams) {
        const {layerConfig, mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({...layerConfig, visParams})
    }

    selectVisualizationType(visualizationType) {
        const {layerConfig: {mosaicType}, mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({visualizationType, mosaicType})
    }

    selectMosaicType(mosaicType) {
        const {layerConfig: {visualizationType}, mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({visualizationType, mosaicType})
    }
}

export const ChangeAlertsImageLayer = compose(
    _ChangeAlertsImageLayer,
    withMapArea(),
    withRecipe(mapRecipeToProps),
    asFunctionalComponent({
        layerConfig: defaultLayerConfig
    })
)

ChangeAlertsImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    imageOutput: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
