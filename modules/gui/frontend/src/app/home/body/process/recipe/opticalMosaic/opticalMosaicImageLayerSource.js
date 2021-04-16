import {Buttons} from 'widget/buttons'
import {Layout} from 'widget/layout'
import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {SceneSelectionType} from './opticalMosaicRecipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import ButtonSelect from 'widget/buttonSelect'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const defaultLayerConfig = {
    bands: {
        selection: ['red', 'green', 'blue'],
        panSharpen: false
    }
}

export class OpticalMosaicImageLayerSource extends React.Component {
    render() {
        const {output} = this.props
        switch (output) {
        case 'LAYER': return <Layer {...this.props}/>
        case 'DESCRIPTION': return <Description {...this.props}/>
        default: throw Error(`Unsupported output type: ${output}`)
        }
    }
}

const Description = ({recipe: {title, placeholder}}) =>
    <React.Fragment>{title || placeholder}</React.Fragment>

class _Layer extends React.Component {
    bandCombinations = [
        ['red', 'green', 'blue'],
        ['nir', 'red', 'green'],
        ['nir', 'swir1', 'red'],
        ['swir2', 'nir', 'red'],
        ['swir2', 'swir1', 'red'],
        ['swir2', 'nir', 'green'],
        ['brightness', 'greenness', 'wetness']
    ]

    metadata = [
        'unixTimeDays',
        'dayOfYear',
        'daysFromTarget'
    ]

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

    hasScenes() {
        const {recipe} = this.props
        const type = selectFrom(recipe, 'model.sceneSelectionOptions.type')
        const scenes = selectFrom(recipe, 'model.scenes') || {}
        return type !== SceneSelectionType.SELECT || Object.values(scenes)
            .find(scenes => scenes.length)
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
        const {layerConfig: {bands: {panSharpen = false}}} = this.props
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
        const {recipe, layerConfig} = this.props
        const compositeOptions = selectFrom(recipe, 'model.compositeOptions')
        const median = compositeOptions.compose === 'MEDIAN'
        const bandCombinationOptions = this.bandCombinations.map(bands => ({
            value: bands.join(', '),
            label: bands.map(band => msg(['bands', band])).join(', ')
        }))
        const metadataOptions = this.metadata.map(band => ({
            value: band,
            label: msg(['bands', band])
        }))
        const options = median
            ? bandCombinationOptions
            : [
                {label: msg('process.mosaic.bands.combinations'), options: bandCombinationOptions},
                {label: msg('process.mosaic.bands.metadata'), options: metadataOptions}
            ]
        const selectedOption = [
            ...bandCombinationOptions,
            ...metadataOptions
        ].find(({value}) => layerConfig.bands.selection.join(', ') === value)
        return (
            <ButtonSelect
                label={selectedOption.label}
                options={options}
                chromeless
                alignment={'left'}
                width={'fill'}
                onSelect={({value}) => this.selectBands(value)}
            />
        )
    }

    canPanSharpen() {
        const {recipe, layerConfig: {bands: {selection}}} = this.props
        const compositeOptions = selectFrom(recipe, 'model.compositeOptions')
        const sources = selectFrom(recipe, 'model.sources')
        const surfaceReflectance = compositeOptions.corrections.includes('SR')
        return sources.LANDSAT
            && !surfaceReflectance
            && selection
            && ['red, green, blue', 'nir, red, green'].includes(selection.join(', '))
    }

    togglePanSharpen(enabled) {
        const {layerConfig: {bands: {selection}}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({bands: {selection, panSharpen: enabled && this.canPanSharpen()}})
    }

    selectBands(bands) {
        const {layerConfig: {bands: {panSharpen}}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({bands: {selection: bands.split(', '), panSharpen}})
    }

}

const Layer = compose(
    _Layer,
    withMapAreaContext()
)

OpticalMosaicImageLayerSource.defaultProps = {
    layerConfig: defaultLayerConfig
}

OpticalMosaicImageLayerSource.propTypes = {
    output: PropTypes.oneOf(['LAYER', 'DESCRIPTION']).isRequired,
    recipe: PropTypes.object.isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
