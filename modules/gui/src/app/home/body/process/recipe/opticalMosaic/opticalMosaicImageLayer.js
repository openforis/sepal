import {Buttons} from 'widget/buttons'
import {Layout} from 'widget/layout'
import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {SceneSelectionType} from './opticalMosaicRecipe'
import {VisualizationSelector} from 'app/home/map/imageLayerSource/visualizationSelector'
import {compose} from 'compose'
import {selectFrom} from 'stateUtils'
import {visualizationOptions} from './visualizations'
import {withMapArea} from 'app/home/map/mapAreaContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const defaultLayerConfig = {
    panSharpen: false
}

class _OpticalMosaicImageLayer extends React.Component {
    render() {
        const {layer, map} = this.props
        return (
            <MapAreaLayout
                layer={this.hasScenes() ? layer : null}
                form={this.renderImageLayerForm()}
                map={map}
            />
        )
    }

    renderImageLayerForm() {
        return (
            <Layout>
                {this.renderBandSelection()}
                {this.canPanSharpen()
                    ? this.renderPanSharpen()
                    : null}
            </Layout>
        )
    }

    renderPanSharpen() {
        const {layerConfig: {panSharpen}} = this.props
        return (
            <Buttons
                label={'Pan sharpen'}
                selected={panSharpen}
                onChange={enabled => this.togglePanSharpen(enabled)}
                options={[
                    {value: true, label: 'Yes'},
                    {value: false, label: 'No'}
                ]}/>
        )
    }

    renderBandSelection() {
        const {recipe, source, layerConfig = {}} = this.props
        const options = visualizationOptions(recipe)
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
        const {layerConfig, mapArea: {updateLayerConfig}} = this.props
        if (_.isUndefined(layerConfig.panSharpen)) {
            updateLayerConfig(defaultLayerConfig)
        }
    }

    hasScenes() {
        const {recipe} = this.props
        const type = selectFrom(recipe, 'model.sceneSelectionOptions.type')
        const scenes = selectFrom(recipe, 'model.scenes') || {}
        return type !== SceneSelectionType.SELECT || Object.values(scenes)
            .find(scenes => scenes.length)
    }

    reflectance() {
        const {recipe} = this.props
        const corrections = selectFrom(recipe, 'model.compositeOptions.corrections')
        return corrections.includes('SR') ? 'SR' : 'TOA'
    }

    canPanSharpen() {
        const {recipe, layerConfig: {visParams}} = this.props
        const sources = selectFrom(recipe, 'model.sources')
        return sources.LANDSAT
        && this.reflectance() === 'TOA'
        && visParams
        && ['red,green,blue', 'nir,red,green'].includes(visParams.bands.join(','))
    }

    togglePanSharpen(enabled) {
        const {layerConfig: {visParams}, mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams, panSharpen: enabled && this.canPanSharpen()})
    }
}

export const OpticalMosaicImageLayer = compose(
    _OpticalMosaicImageLayer,
    withMapArea()
)

OpticalMosaicImageLayer.defaultProps = {
    layerConfig: defaultLayerConfig
}

OpticalMosaicImageLayer.propTypes = {
    recipe: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    layer: PropTypes.object,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
