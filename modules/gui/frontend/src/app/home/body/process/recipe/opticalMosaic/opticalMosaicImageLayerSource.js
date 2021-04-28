import {Buttons} from 'widget/buttons'
import {Combo} from 'widget/combo'
import {Layout} from 'widget/layout'
import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {SceneSelectionType} from './opticalMosaicRecipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {visualizations} from './visualizations'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const defaultLayerConfig = {
    panSharpen: false
}

class _OpticalMosaicImageLayerSource extends React.Component {
    render() {
        const {recipe, layerConfig, map} = this.props
        const layer = map && recipe.ui.initialized && this.hasScenes()
            ? EarthEngineLayer.fromRecipe({recipe: _.omit(recipe, ['ui', 'layers']), layerConfig, map})
            : null

        return (
            <MapAreaLayout
                layer={layer}
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
        const {layerConfig: {visParams}} = this.props
        const visParamsToOption = visParams => ({
            value: visParams.bands.join(','),
            label: visParams.bands.map(band => msg(['bands', band])).join(', '),
            visParams
        })
        const bandCombinationOptions = {
            label: msg('process.mosaic.bands.combinations'),
            options: visualizations[this.reflectance()].map(visParamsToOption)
        }
        const indexOptions = {
            label: msg('process.mosaic.bands.indexes'),
            options: visualizations.indexes.map(visParamsToOption)
        }
        const metadataOptions = {
            label: msg('process.mosaic.bands.metadata'),
            options: visualizations.metadata.map(visParamsToOption)
        }
        const options = this.median()
            ? [bandCombinationOptions, indexOptions]
            : [bandCombinationOptions, indexOptions, metadataOptions]
        const selectedBands = visParams && visParams.bands || []
        const selectedOption = [
            ...bandCombinationOptions.options,
            ...indexOptions.options,
            ...metadataOptions.options
        ].find(({value}) => selectedBands.join(',') === value) || bandCombinationOptions.options[0]
        return (
            <Combo
                label={msg('process.mosaic.bands.label')}
                placeholder={selectedOption.label}
                options={options}
                value={selectedOption.value}
                onChange={({visParams}) => this.selectVisualization(visParams)}
            />
        )
    }

    componentDidMount() {
        this.selectVisualization(visualizations[this.reflectance()][0])
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

    median() {
        const {recipe} = this.props
        const compositeOptions = selectFrom(recipe, 'model.compositeOptions')
        return compositeOptions.compose === 'MEDIAN'
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
        const {layerConfig: {visParams}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams, panSharpen: enabled && this.canPanSharpen()})
    }

    selectVisualization(visParams) {
        const {layerConfig: {panSharpen}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams, panSharpen})
    }
}

export const OpticalMosaicImageLayerSource = compose(
    _OpticalMosaicImageLayerSource,
    withMapAreaContext()
)

OpticalMosaicImageLayerSource.defaultProps = {
    layerConfig: defaultLayerConfig
}

OpticalMosaicImageLayerSource.propTypes = {
    recipe: PropTypes.object.isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
