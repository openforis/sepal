import {compose} from 'compose'
import {getImageLayerSource} from '../../map/imageLayerSource/imageLayerSource'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import {withRecipe} from './recipeContext'
import React from 'react'

const mapRecipeToProps = recipe => ({
    layers: selectFrom(recipe, 'layers'),
    standardImageLayerSources: selectFrom(recipe, 'ui.imageLayerSources') || [],
    recipeFeatureLayerSources: selectFrom(recipe, 'ui.featureLayerSources') || [],
    recipe
})

export const withLayers = () =>
    WrappedComponent => {
        class WithLayersHOC extends React.Component {
            render() {
                const {
                    recipe,
                    layers,
                    standardImageLayerSources,
                    recipeFeatureLayerSources,
                    mapAreaContext: {area} = {}
                } = this.props
                const {additionalImageLayerSources = [], areas = {}} = layers
                const {imageLayer: {sourceId, layerConfig} = {}, featureLayerSources: areaFeatureLayerSources = []} = areas[area] || {}

                const imageLayerSources = [...standardImageLayerSources, ...additionalImageLayerSources]
                const source = imageLayerSources.find(({id}) => id === sourceId)
                const {getFeatureLayerSources} = getImageLayerSource({recipe, source, layerConfig})
                const featureLayerSources = [
                    ...recipeFeatureLayerSources,
                    ...areaFeatureLayerSources,
                    ...((getFeatureLayerSources && getFeatureLayerSources()) || [])
                ]

                const layerProps = {
                    standardImageLayerSources,
                    additionalImageLayerSources,
                    imageLayerSources,
                    featureLayerSources,
                    layers
                }
                return React.createElement(WrappedComponent, {...this.props, ...layerProps})
            }
        }

        return compose(
            WithLayersHOC,
            withRecipe(mapRecipeToProps),
            withMapAreaContext(),
        )
    }
