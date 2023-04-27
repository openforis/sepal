import {Buttons} from 'widget/buttons'
import {Layout} from 'widget/layout'
import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {VisualizationSelector} from 'app/home/map/imageLayerSource/visualizationSelector'
import {compose} from 'compose'
import {getAvailableBands} from './bands'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {visualizationOptions} from './visualizations'
import {withMapArea} from 'app/home/map/mapAreaContext'
import {withRecipe} from '../../recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const defaultLayerConfig = {
    visualizationType: 'alerts'
}

const mapRecipeToProps = (recipe, {source}) => {
    return {
        initialized: selectFrom(recipe, 'ui.initialized'),
        sources: selectFrom(recipe, 'model.sources'),
        userDefinedVisualizations: selectFrom(recipe, ['layers.userDefinedVisualizations', source.id]) || []
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
        return (
            <Layout>
                {this.renderVisualizationType()}
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

    renderVisualizationSelector() {
        const {layerConfig: {visualizationType}, recipe, source, layerConfig = {}} = this.props
        const options = visualizationOptions(recipe, visualizationType)
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
                .find(({id, bands}) =>
                    id === prevVisParams.id && (prevVisParams.id || _.isEqual(bands, prevVisParams.bands))
                )
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
        const {userDefinedVisualizations, layerConfig: {visualizationType}, recipe} = this.props
        const options = visualizationOptions(recipe, visualizationType)
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
        const {mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({visualizationType})
    }
}

export const BaytsAlertsImageLayer = compose(
    _BaytsAlertsImageLayer,
    withMapArea(),
    withRecipe(mapRecipeToProps)
)

BaytsAlertsImageLayer.defaultProps = {
    layerConfig: defaultLayerConfig
}

BaytsAlertsImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
