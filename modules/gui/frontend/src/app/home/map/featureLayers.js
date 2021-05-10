import {AoiLayer} from 'app/home/map/aoiLayer'
import {LabelsLayer} from 'app/home/map/labelsLayer'
import {LegendLayer} from './legendLayer'
import {SceneAreasLayer} from 'app/home/body/process/recipe/opticalMosaic/sceneAreasLayer'
import {compose} from 'compose'
import {withLayers} from 'app/home/body/process/withLayers'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'

const _FeatureLayers = ({featureLayerSources, selectedLayers, map}) => {
    return map
        ? selectedLayers.map((layer, i) => {
            const source = featureLayerSources.find(({id}) => id === layer.sourceId)
            return (
                source
                    ? (
                        <FeatureLayer
                            key={i}
                            id={source.type}
                            source={source}
                            layerConfig={layer.layerConfig}
                            layerIndex={i + 1}
                            map={map}
                        />
                    )
                    : null
            )
        })
        : null
}

export const FeatureLayers = compose(
    _FeatureLayers,
    withLayers()
)

FeatureLayers.propTypes = {
    map: PropTypes.any,
    selectedLayers: PropTypes.any
}

const _FeatureLayer = ({source, map, recipe, layerConfig, layerIndex}) => {
    const id = source.type
    switch(source.type) {
    case 'Labels': return <LabelsLayer id={id} layerIndex={layerIndex} map={map}/>
    case 'Legend': return <LegendLayer/>
    case 'Aoi': return <AoiLayer id={source.type} layerConfig={layerConfig} layerIndex={layerIndex} recipe={recipe} map={map}/>
    case 'SceneAreas': return <SceneAreasLayer map={map}/>
    default: throw Error(`Unsupported feature layer type: ${source.type}`)
    }
}

export const FeatureLayer = compose(
    _FeatureLayer,
    withRecipe(recipe => ({recipe})),
    withLayers()
)

