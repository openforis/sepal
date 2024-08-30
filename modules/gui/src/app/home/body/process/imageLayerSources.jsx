import _ from 'lodash'

import {AssetImageLayer} from '~/app/home/map/imageLayerSource/assetImageLayer'
import {GoogleSatelliteImageLayer} from '~/app/home/map/imageLayerSource/googleSatelliteImageLayer'
import {PlanetImageLayer} from '~/app/home/map/imageLayerSource/planetImageLayer'
import {createLegendFeatureLayerSource} from '~/app/home/map/legendFeatureLayerSource'
import {createPaletteFeatureLayerSource} from '~/app/home/map/paletteFeatureLayerSource'
import {createValuesFeatureLayerSource} from '~/app/home/map/valuesFeatureLayerSource'

import {addImageLayerSource} from './imageLayerSourceRegistry'
import {RecipeImageLayer} from './recipe/recipeImageLayer'
import {RecipeImageLayerSource} from './recipe/recipeImageLayerSource'

const ASSET_RECIPE_FEATURE_LAYER_SOURCES = {
    continuous: () => [createPaletteFeatureLayerSource()],
    categorical: () => [createLegendFeatureLayerSource()],
    rgb: () => [createValuesFeatureLayerSource()],
    hsv: () => [createValuesFeatureLayerSource()]
}

const getAssetRecipeFeatureLayerSources = layerConfig => {
    const visParams = layerConfig && layerConfig.visParams
    if (_.isObject(visParams)) {
        const assetRecipeFeatureLayerSource = ASSET_RECIPE_FEATURE_LAYER_SOURCES[visParams.type]
        return assetRecipeFeatureLayerSource ? assetRecipeFeatureLayerSource() : []
    }
    return []
}

export const registerImageLayerSources = () => {
    addImageLayerSource('Recipe', ({recipe, source, layerConfig = {}, map, boundsChanged$, dragging$, cursor$}) =>
        recipe ? {
            description: source.sourceConfig.description,
            sourceComponent: (
                <RecipeImageLayerSource
                    key={source.id}
                    source={source}
                    map={map}/>
            ),
            layerComponent: (
                <RecipeImageLayer
                    currentRecipe={recipe}
                    source={source}
                    layerConfig={layerConfig}
                    map={map}
                    boundsChanged$={boundsChanged$}
                    dragging$={dragging$}
                    cursor$={cursor$}
                />
            ),
            getFeatureLayerSources: () => getAssetRecipeFeatureLayerSources(layerConfig)
        } : {}
    )

    addImageLayerSource('Asset', ({source, layerConfig, map, boundsChanged$, dragging$, cursor$}) => ({
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
    }))

    addImageLayerSource('Planet', ({source: {sourceConfig}, layerConfig, map}) => ({
        description: sourceConfig.description,
        layerComponent: (
            <PlanetImageLayer
                layerConfig={layerConfig}
                planetApiKey={sourceConfig.planetApiKey}
                description={sourceConfig.description}
                map={map}/>
        )
    }))

    addImageLayerSource('GoogleSatellite', ({map}) => ({
        description: 'Google high-res satellite imagery',
        layerComponent: (
            <GoogleSatelliteImageLayer map={map}/>
        )
    }))
}
