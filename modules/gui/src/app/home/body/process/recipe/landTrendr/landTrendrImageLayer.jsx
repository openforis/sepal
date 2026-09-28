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
import {layerSelection, layerVisualizations, presetVisualizations} from '../visualizations'
import {layerConfigChanges, mapProducts, selectedYear} from './bands'
import {visualizationOptions} from './visualizations'

const defaultLayerConfig = mapProducts.defaults

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    dates: selectFrom(recipe, 'model.dates')
})

class _LandTrendrImageLayer extends React.Component {
    // A layer built for a config that still needs reconciling would request a year the form is about to replace, and
    // the map mounts it before the form can write the correction. It is withheld until the config agrees; the
    // corrected config builds a new one.
    render() {
        const {initialized, layer, map, dates, layerConfig} = this.props
        return initialized
            ? (
                <MapAreaLayout
                    layer={layerConfigChanges(dates, layerConfig) ? null : layer}
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
        const {dates, layerConfig: {year}} = this.props
        const {startYear, endYear} = dates
        const options = _.range(startYear, endYear + 1)
            .map(year => ({value: year, label: `${year}`}))
        return (
            <Combo
                label={msg('process.landTrendr.imageLayerForm.year.label')}
                tooltip={msg('process.landTrendr.imageLayerForm.year.tooltip')}
                placeholder={msg('process.landTrendr.imageLayerForm.year.label')}
                options={options}
                value={selectedYear(dates, year)}
                onChange={({value}) => this.selectYear(value)}
            />
        )
    }

    renderVisualizationSelector() {
        const {recipe, source, layerConfig = {}, imageOutput} = this.props
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={visualizationOptions(recipe, imageOutput)}
                availableBands={imageOutput.availableBands}
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

    // The layer config is brought into the recipe's fitted period before a style is chosen for it: a style is written
    // with the config it was chosen beside, which would write a stale year back. Only what changes is written, and the
    // map merges it into the config, so the style is kept.
    reconcile() {
        const {dates, layerConfig, mapArea: {updateLayerConfig}} = this.props
        const changes = layerConfigChanges(dates, layerConfig)
        if (changes) {
            updateLayerConfig(changes)
        } else {
            this.reconcileVisualization()
        }
    }

    // Switching mode changes which bands exist, so a style selected for the previous mode gives way to one of this
    // mode's.
    reconcileVisualization() {
        const {recipe, imageOutput, layerConfig: {visParams}} = this.props
        const selection = layerSelection({recipe, imageOutput, visualizations: this.visualizations(), visParams})
        if (selection) {
            this.selectVisualization(selection)
        }
    }

    visualizations() {
        const {currentRecipe, recipe, source, imageOutput} = this.props
        return layerVisualizations({
            currentRecipe,
            recipe,
            sourceId: source.id,
            presets: presetVisualizations(visualizationOptions(recipe, imageOutput)),
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
    imageOutput: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
