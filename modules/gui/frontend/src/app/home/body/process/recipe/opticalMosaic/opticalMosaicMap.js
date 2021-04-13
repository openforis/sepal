import {MapAreaLayout} from 'app/home/map/mapAreaLayout'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipePath} from '../../recipe'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import {withRecipe} from '../../recipeContext'
import ButtonSelect from 'widget/buttonSelect'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'

const defaultLayerConfig = {
    bands: {
        selection: ['red', 'green', 'blue'] // TODO: Fix...
    }
}

export class _OpticalMosaicMap extends React.Component {
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
        const {layerConfig} = this.props
        const options = [
            {
                label: msg('process.mosaic.bands.combinations'),
                options: [
                    {value: 'red, green, blue', label: 'RED, GREEN, BLUE'},
                    {value: 'nir, red, green', label: 'NIR, RED, GREEN'},
                    {value: 'nir, swir1, red', label: 'NIR, SWIR1, RED'},
                    {value: 'swir2, nir, red', label: 'SWIR2, NIR, RED'},
                    {value: 'swir2, swir1, red', label: 'SWIR2, SWIR1, RED'},
                    {value: 'swir2, nir, green', label: 'SWIR2, NIR, GREEN'},
                    {value: 'brightness, greenness, wetness', label: 'Brightness, Greenness, Wetness'}
                ]
            },
            {
                label: msg('process.mosaic.bands.metadata'),
                options: [
                    {value: 'unixTimeDays', label: msg('bands.unixTimeDays')},
                    {value: 'dayOfYear', label: msg('bands.dayOfYear')},
                    {value: 'daysFromTarget', label: msg('bands.daysFromTarget')}
                ]
            }
        ]
        return <ButtonSelect
            label={layerConfig.bands.selection.join(', ')} // TODO: Fix...
            options={options}
            chromeless
            alignment={'left'}
            width={'fill'}
            onSelect={({value}) => this.selectBands(value)}
        />
    }

    selectBands(bands) {
        const {recipeId, mapAreaContext: {area}} = this.props
        actionBuilder('SELECT_BANDS', {bands})
            .set(
                [recipePath(recipeId), 'layers.areas', area, 'imageLayer.layerConfig.bands.selection'],
                bands.split(', ')
            )
            .dispatch()
    }
}

export const OpticalMosaicMap = compose(
    _OpticalMosaicMap,
    withRecipe(),
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
