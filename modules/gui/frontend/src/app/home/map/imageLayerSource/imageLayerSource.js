import {AssetImageLayerSource} from './assetImageLayerSource'
import {GoogleSatelliteImageLayerSource} from './googleSatelliteImageLayerSource'
import {OpticalMosaicImageLayerSource} from 'app/home/body/process/recipe/opticalMosaic/opticalMosaicImageLayerSource'
import {PlanetImageLayerSource} from './planetImageLayerSource'
import React from 'react'

const getRecipeImageLayerSource = ({recipe, layerConfig, map}) => {
    if (!recipe) {
        return {}
    }
    const {type, title, placeholder} = recipe
    switch(type) {
    case 'MOSAIC':
        return ({
            description: title || placeholder,
            component: (
                <OpticalMosaicImageLayerSource
                    recipe={recipe}
                    layerConfig={layerConfig}
                    map={map}/>
            )
        })
    default: throw Error(`Unsupported recipe type: ${type}`)
    }
}

const getPlanetImageLayerSource = ({source: {sourceConfig}, layerConfig, map}) => ({
    description: sourceConfig.description,
    component: (
        <PlanetImageLayerSource
            layerConfig={layerConfig}
            planetApiKey={sourceConfig.planetApiKey}
            description={sourceConfig.description}
            map={map}/>
    )
})

const getGoogleSatelliteImageLayerSource = ({map}) => ({
    description: 'Google high-res satellite imagery',
    component: (
        <GoogleSatelliteImageLayerSource map={map}/>
    )
})

const getAssetImageLayerSource = (source, layerConfig, map) => ({
    description: source.sourceConfig.asset,
    component: (
        <AssetImageLayerSource
            source={source}
            layerConfig={layerConfig}
            map={map}/>
    )
})

export const getImageLayerSource = ({source, recipe, layerConfig, map}) => {
    if (!source) {
        return {}
    }
    const {type} = source
    switch(type) {
    case 'Recipe':
        return getRecipeImageLayerSource({recipe, layerConfig, map})
    case 'Asset':
        return getAssetImageLayerSource()
    case 'Planet':
        return getPlanetImageLayerSource({source, layerConfig, map})
    case 'GoogleSatellite':
        return getGoogleSatelliteImageLayerSource({map})
    default: throw Error(`Unsupported image layer source type: ${type}`)
    }
}
