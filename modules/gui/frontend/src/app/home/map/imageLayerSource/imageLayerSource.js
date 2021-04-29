import {AssetImageLayer} from './assetImageLayer'
import {GoogleSatelliteImageLayer} from './googleSatelliteImageLayer'
import {PlanetImageLayer} from './planetImageLayer'
import {RecipeImageLayer} from 'app/home/body/process/recipe/recipeImageLayer'
import {RecipeImageLayerSource} from 'app/home/body/process/recipe/recipeImageLayerSource'
import React from 'react'

const getRecipeImageLayerSource = ({recipe, source, layerConfig = {}, map}) => {
    if (!recipe) {
        return {}
    }
    return {
        description: source.sourceConfig.description,
        sourceComponent: (
            <RecipeImageLayerSource
                key={source.id}
                source={source}
                map={map}/>
        ),
        layerComponent: (
            <RecipeImageLayer
                source={source}
                layerConfig={layerConfig}
                map={map}/>
        )
    }
}

const getPlanetImageLayerSource = ({source: {sourceConfig}, layerConfig, map}) => ({
    description: sourceConfig.description,
    layerComponent: (
        <PlanetImageLayer
            layerConfig={layerConfig}
            planetApiKey={sourceConfig.planetApiKey}
            description={sourceConfig.description}
            map={map}/>
    )
})

const getGoogleSatelliteImageLayerSource = ({map}) => ({
    description: 'Google high-res satellite imagery',
    layerComponent: (
        <GoogleSatelliteImageLayer map={map}/>
    )
})

const getAssetImageLayerSource = ({source, layerConfig, map}) => ({
    description: source.sourceConfig.asset,
    layerComponent: (
        <AssetImageLayer
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
        return getRecipeImageLayerSource({recipe, source, layerConfig, map})
    case 'Asset':
        return getAssetImageLayerSource({source, layerConfig, map})
    case 'Planet':
        return getPlanetImageLayerSource({source, layerConfig, map})
    case 'GoogleSatellite':
        return getGoogleSatelliteImageLayerSource({map})
    default: throw Error(`Unsupported image layer source type: ${type}`)
    }
}
