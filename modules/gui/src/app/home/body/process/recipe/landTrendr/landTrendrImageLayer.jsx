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
import {Combo} from '~/widget/combo'
import {Layout} from '~/widget/layout'

import {withRecipe} from '../../recipeContext'
import {getAvailableBands} from './bands'
import {visualizationOptions} from './visualizations'

const defaultLayerConfig = {visualizationType: 'changes'}

const mapRecipeToProps = (recipe, {source}) => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    dates: selectFrom(recipe, 'model.dates'),
    userDefinedVisualizations: selectFrom(recipe, ['layers.userDefinedVisualizations', source.id]) || []
})

class _LandTrendrImageLayer extends React.Component {
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
                {visualizationType === 'mosaics' ? this.renderYear() : null}
                {this.renderVisualizationSelector()}
            </Layout>
        )
    }

    renderVisualizationType() {
        const {layerConfig: {visualizationType}} = this.props
        const options = [
            {value: 'changes', label: msg('process.landTrendr.imageLayerForm.visualizationType.changes.label'), tooltip: msg('process.landTrendr.imageLayerForm.visualizationType.changes.tooltip')},
            {value: 'mosaics', label: msg('process.landTrendr.imageLayerForm.visualizationType.mosaics.label'), tooltip: msg('process.landTrendr.imageLayerForm.visualizationType.mosaics.tooltip')}
        ]
        const selectedOption = options.find(({value}) => value === visualizationType) || {}
        return (
            <Buttons
                label={msg('process.landTrendr.imageLayerForm.visualizationType.label')}
                selected={selectedOption.value}
                options={options}
                onChange={visualizationType => this.selectVisualizationType(visualizationType)}
            />
        )
    }

    renderYear() {
        const {dates: {startYear, endYear}, layerConfig: {year}} = this.props
        const options = _.range(startYear, endYear + 1)
            .map(year => ({value: year, label: `${year}`}))
        return (
            <Combo
                label={msg('process.landTrendr.imageLayerForm.year.label')}
                tooltip={msg('process.landTrendr.imageLayerForm.year.tooltip')}
                placeholder={msg('process.landTrendr.imageLayerForm.year.label')}
                options={options}
                value={year}
                onChange={({value}) => this.selectYear(value)}
            />
        )
    }

    renderVisualizationSelector() {
        const {recipe, source, layerConfig = {}} = this.props
        const {visualizationType} = layerConfig
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={visualizationOptions(recipe, visualizationType)}
                availableBands={Object.keys(getAvailableBands(recipe, visualizationType))}
                selectedVisParams={layerConfig.visParams}
            />
        )
    }

    componentDidMount() {
        const {layerConfig: {visParams, visualizationType}, dates: {endYear}, mapArea: {updateLayerConfig}} = this.props
        if (!visualizationType) {
            updateLayerConfig({...defaultLayerConfig, year: endYear})
        }
        this.update(visParams)
    }

    componentDidUpdate(prevProps) {
        const {layerConfig: {visParams: prevVisParams}} = prevProps
        this.update(prevVisParams)
    }

    // Switching mode changes which bands exist, so a visParams selected for the
    // previous mode has to be replaced rather than left dangling.
    update(prevVisParams) {
        const {recipe} = this.props
        if (!recipe) return
        const allVisualizations = this.toAllVis()
        if (!allVisualizations.length) return
        if (prevVisParams) {
            const visParams = allVisualizations
                .find(({id, bands}) => id === prevVisParams.id && (prevVisParams.id || _.isEqual(bands, prevVisParams.bands)))
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
        const availableBands = getAvailableBands(recipe, visualizationType)
        const flatten = options => options
            .map(option => option.options
                ? flatten(option.options)
                : option.visParams
            )
            .flat()
        return [
            ...userDefinedVisualizations,
            ...flatten(visualizationOptions(recipe, visualizationType))
        ].filter(visParams => visParams.bands.every(band => Object.keys(availableBands).includes(band)))
    }

    selectVisualization(visParams) {
        const {layerConfig, mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({...layerConfig, visParams})
    }

    selectVisualizationType(visualizationType) {
        const {dates: {endYear}, layerConfig: {year}, mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({visualizationType, year: year ?? endYear})
    }

    selectYear(year) {
        const {layerConfig: {visualizationType}, mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({visualizationType, year})
    }
}

export const LandTrendrImageLayer = compose(
    _LandTrendrImageLayer,
    withMapArea(),
    withRecipe(mapRecipeToProps),
    asFunctionalComponent({
        layerConfig: defaultLayerConfig
    })
)

LandTrendrImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
