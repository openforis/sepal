import {AssetImageLayerSource} from './assetImageLayerSource'
import {GoogleSatelliteImageLayerSource} from './googleSatelliteImageLayerSource'
import {PlanetImageLayerSource} from './planetImageLayerSource'
import {RecipeImageLayerSource} from 'app/home/body/process/recipe/recipeImageLayerSource'
import PropTypes from 'prop-types'
import React from 'react'

export class ImageLayerSource extends React.Component {
    render() {
        const {source: {type, sourceConfig}, layerConfig, map, output} = this.props
        switch(type) {
        case 'Recipe': return (
            <RecipeImageLayerSource
                recipeId={sourceConfig.recipeId}
                layerConfig={layerConfig}
                map={map}
                output={output}/>
        )
        case 'Asset': return (
            <AssetImageLayerSource
                asset={sourceConfig.asset}
                layerConfig={layerConfig}
                map={map}
                output={output}/>
        )
        case 'Planet': return (
            <PlanetImageLayerSource
                layerConfig={layerConfig}
                planetApiKey={sourceConfig.planetApiKey}
                description={sourceConfig.description}
                map={map}
                output={output}/>
        )
        case 'GoogleSatellite': return (
            <GoogleSatelliteImageLayerSource
                map={map}
                output={output}
            />
        )
        default: throw Error(`Unsupported image layer source type: ${type}`)
        }
    }
}

ImageLayerSource.propTypes = {
    output: PropTypes.oneOf(['LAYER', 'DESCRIPTION']).isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object,
}
