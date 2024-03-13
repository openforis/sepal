import {Buttons} from '~/widget/buttons'
import {Layout} from '~/widget/layout'
import {MapAreaLayout} from '~/app/home/map/mapAreaLayout'
import {VisualizationSelector} from '~/app/home/map/imageLayerSource/visualizationSelector'
import {compose} from '~/compose'
import {getAvailableBands} from './bands'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import {visualizationOptions} from './visualizations'
import {withMapArea} from '~/app/home/map/mapAreaContext'
import {withRecipe} from '../../recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const defaultLayerConfig = {
    visualizationType: 'changes',
    mosaicType: 'latest'
}

const mapRecipeToProps = (recipe, {source}) => {
    return {
        initialized: selectFrom(recipe, 'ui.initialized'),
        sources: selectFrom(recipe, 'model.sources'),
        userDefinedVisualizations: selectFrom(recipe, ['layers.userDefinedVisualizations', source.id]) || []
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
        const availableBands = getAvailableBands(recipe, visualizationType)
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={options}
                availableBands={Object.keys(availableBands)}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }

    componentDidMount() {
        const {layerConfig: {visParams, visualizationType}, mapArea: {updateLayerConfig}} = this.props

        if (!visualizationType) {
            updateLayerConfig(defaultLayerConfig)
        }
        this.update(visParams)
    }

    componentDidUpdate(prevProps) {
        const {layerConfig: {visParams: prevVisParams}} = prevProps
        this.update(prevVisParams)
    }

    update(prevVisParams) {
        const {recipe} = this.props
        if (!recipe) return
        const allVisualizations = this.toAllVis()
        if (!allVisualizations.length) return
        if (prevVisParams) {
            const visParams = allVisualizations
                .find(({
                    id,
                    bands
                }) => id === prevVisParams.id && (prevVisParams.id || _.isEqual(bands, prevVisParams.bands)))
            if (!visParams) {
                this.selectVisualization(allVisualizations[0])
            } else if (!_.isEqual(visParams, prevVisParams)) {
                this.selectVisualization(visParams)
            }
        } else {
            this.selectVisualization(allVisualizations[0])
        }
    }

    toAllVis() {
        const {userDefinedVisualizations, layerConfig: {visualizationType, mosaicType}, recipe} = this.props
        const options = visualizationOptions(recipe, visualizationType, mosaicType)
        const availableBands = getAvailableBands(recipe, visualizationType)
        const flatten = options => options
            .map(option => option.options
                ? flatten(option.options)
                : option.visParams
            )
            .flat()
        return [
            ...userDefinedVisualizations,
            ...flatten(options)
        ].filter(visParams => visParams.bands.every(band => Object.keys(availableBands).includes(band)))
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
