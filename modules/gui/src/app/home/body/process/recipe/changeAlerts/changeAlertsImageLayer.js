import {Buttons} from 'widget/buttons'
import {Layout} from 'widget/layout'
import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {VisualizationSelector} from 'app/home/map/imageLayerSource/visualizationSelector'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {visualizationOptions} from './visualizations'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import {withRecipe} from '../../recipeContext'
import PropTypes from 'prop-types'
import React from 'react'

const defaultLayerConfig = {
    visualizationType: 'changes',
    mosaicType: 'latest'
}

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
        const {layerConfig: {visualizationType, mosaicType}, recipe, source, layerConfig = {}} = this.props
        const options = visualizationOptions(recipe, visualizationType, mosaicType)
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
        const {layerConfig, mapAreaContext: {updateLayerConfig}} = this.props
        if (!layerConfig.visualizationType) {
            updateLayerConfig(defaultLayerConfig)
        }
    }

    selectVisualizationType(visualizationType) {
        const {layerConfig: {mosaicType}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visualizationType, mosaicType})
    }

    selectMosaicType(mosaicType) {
        const {layerConfig: {visualizationType}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visualizationType, mosaicType})
    }
}

export const ChangeAlertsImageLayer = compose(
    _ChangeAlertsImageLayer,
    withMapAreaContext(),
    withRecipe(mapRecipeToProps)
)

ChangeAlertsImageLayer.defaultProps = {
    layerConfig: defaultLayerConfig
}

ChangeAlertsImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
