import {Buttons} from 'widget/buttons'
import {Layout} from 'widget/layout'
import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import ButtonSelect from 'widget/buttonSelect'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'

const defaultLayerConfig = {
    bands: {
        selection: ['red', 'green', 'blue'],
        panSharpen: false
    }
}

export class _OpticalMosaicMap extends React.Component {
    bandCombinationOptions = [
        {value: 'red, green, blue', label: 'RED, GREEN, BLUE'},
        {value: 'nir, red, green', label: 'NIR, RED, GREEN'},
        {value: 'nir, swir1, red', label: 'NIR, SWIR1, RED'},
        {value: 'swir2, nir, red', label: 'SWIR2, NIR, RED'},
        {value: 'swir2, swir1, red', label: 'SWIR2, SWIR1, RED'},
        {value: 'swir2, nir, green', label: 'SWIR2, NIR, GREEN'},
        {value: 'brightness, greenness, wetness', label: 'Brightness, Greenness, Wetness'}
    ]

    metadataOptions = [
        {value: 'unixTimeDays', label: msg('bands.unixTimeDays')},
        {value: 'dayOfYear', label: msg('bands.dayOfYear')},
        {value: 'daysFromTarget', label: msg('bands.daysFromTarget')}
    ]
    render() {
        const {recipe, layerConfig, map} = this.props
        // TODO: recipe.ui.initialized
        //  If manual scene selection, one scene must be selected
        const initialized = recipe.model.aoi
        const layer = map && initialized
            ? EarthEngineLayer.fromRecipe({recipe, layerConfig, map})
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
        const options = median
            ? this.bandCombinationOptions
            : [
                {label: msg('process.mosaic.bands.combinations'), options: this.bandCombinationOptions},
                {label: msg('process.mosaic.bands.metadata'), options: this.metadataOptions}
            ]
        const label = [
            ...this.bandCombinationOptions,
            ...this.metadataOptions
        ].find(({value}) => layerConfig.bands.selection.join(', ') === value).label
        return (
            <ButtonSelect
                label={label}
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
            && ['red, green, blue', 'nir, red, green'].includes(selection && selection.join(', ')) // TODO: Fix
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

export const OpticalMosaicMap = compose(
    _OpticalMosaicMap,
    withMapAreaContext()
)

OpticalMosaicMap.defaultProps = {
    layerConfig: defaultLayerConfig
}

OpticalMosaicMap.propTypes = {
    recipe: PropTypes.object.isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
