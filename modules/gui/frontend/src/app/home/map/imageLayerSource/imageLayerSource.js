import {AssetImageLayer} from './assetImageLayer'
import {GoogleSatelliteImageLayer} from './googleSatelliteImageLayer'
import {PlanetImageLayer} from './planetImageLayer'
import {RecipeImageLayer} from 'app/home/body/process/recipe/recipeImageLayer'
import {RecipeImageLayerSource} from 'app/home/body/process/recipe/recipeImageLayerSource'
import {createLegendFeatureLayerSource} from '../legendFeatureLayerSource'
import {createPaletteFeatureLayerSource} from '../paletteFeatureLayerSource'
import {createValuesFeatureLayerSource} from '../valuesFeatureLayerSource'
import {selectFrom} from 'stateUtils'
import React from 'react'

const getRecipeImageLayerSource = ({recipe, source, layerConfig = {}, map, boundsChanged$, dragging$, cursor$}) => {
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
                map={map}
                boundsChanged$={boundsChanged$}
                dragging$={dragging$}
                cursor$={cursor$}
            />
        ),
        getFeatureLayerSources: () => getAssetRecipeFeatureLayerSources(layerConfig)
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

const getAssetImageLayerSource = ({source, layerConfig, map, boundsChanged$, dragging$, cursor$}) => {
    return ({
        description: source.sourceConfig.asset,
        layerComponent: (
            <AssetImageLayer
                source={source}
                layerConfig={layerConfig}
                map={map}
                boundsChanged$={boundsChanged$}
                dragging$={dragging$}
                cursor$={cursor$}
            />
        ),
        getFeatureLayerSources: () => getAssetRecipeFeatureLayerSources(layerConfig)
    })
}

const getAssetRecipeFeatureLayerSources = layerConfig => {
    const type = selectFrom(layerConfig, 'visParams.type')
    switch(type) {
    case 'continuous':
        return [createPaletteFeatureLayerSource()]
    case 'categorical':
        return [createLegendFeatureLayerSource()]
    case 'rgb':
    case 'hsv':
        return [createValuesFeatureLayerSource()]
    default: return []
    }
}

export const getImageLayerSource = ({source, recipe, layerConfig, map, boundsChanged$, dragging$, cursor$}) => {
    if (!source) {
        return {}
    }
    const {type} = source
    switch(type) {
    case 'Recipe':
        return getRecipeImageLayerSource({recipe, source, layerConfig, map, boundsChanged$, dragging$, cursor$})
    case 'Asset':
        return getAssetImageLayerSource({source, layerConfig, map, boundsChanged$, dragging$, cursor$})
    case 'Planet':
        return getPlanetImageLayerSource({source, layerConfig, map})
    case 'GoogleSatellite':
        return getGoogleSatelliteImageLayerSource({map})
    default: throw Error(`Unsupported image layer source type: ${type}`)
    }
}
