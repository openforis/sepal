import memoizeOne from 'memoize-one'
import React from 'react'

import {withMapArea} from '~/app/home/map/mapAreaContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'

import {getImageLayerSource} from './imageLayerSourceRegistry'
import {assembleImageLayerSources} from './mapLayout/dependencyLayerSources'
import {withRecipe} from './recipeContext'

const mapRecipeToProps = recipe => ({
    layers: selectFrom(recipe, 'layers'),
    standardImageLayerSources: selectFrom(recipe, 'ui.imageLayerSources') || [],
    recipeFeatureLayerSources: selectFrom(recipe, 'ui.featureLayerSources') || [],
    recipe
})

// The listing names the recipes a recipe's derived layer sources show.
const mapStateToProps = state => ({
    recipeListing: selectFrom(state, 'process.recipes') || []
})

export const withLayers = () =>
    WrappedComponent =>
        compose(
            class WithLayersHOC extends React.Component {
                // Assembled again only when the recipe or the listing changes, not on every render.
                assembleImageLayerSources = memoizeOne(assembleImageLayerSources)

                render() {
                    const {
                        recipe,
                        layers,
                        recipeListing,
                        standardImageLayerSources,
                        recipeFeatureLayerSources,
                        mapArea: {area} = {}
                    } = this.props
                    const {additionalFeatureLayerSources = [], areas = {}} = layers
                    const {
                        dependencySources: dependencyImageLayerSources,
                        additionalImageLayerSources,
                        legacySourceIds: legacyImageLayerSourceIds
                    } = this.assembleImageLayerSources(recipe, recipeListing)
                    const {imageLayer: {sourceId, layerConfig} = {}, featureLayerSources: areaFeatureLayerSources = []} = areas[area] || {}

                    const imageLayerSources = [...standardImageLayerSources, ...dependencyImageLayerSources, ...additionalImageLayerSources]
                    const source = imageLayerSources.find(({id}) => id === sourceId)
                    const {getFeatureLayerSources} = getImageLayerSource({recipe, source, layerConfig})
                    const featureLayerSources = [
                        ...recipeFeatureLayerSources,
                        ...additionalFeatureLayerSources,
                        ...areaFeatureLayerSources,
                        ...((getFeatureLayerSources && getFeatureLayerSources()) || [])
                    ]

                    const layerProps = {
                        standardImageLayerSources,
                        dependencyImageLayerSources,
                        additionalImageLayerSources,
                        legacyImageLayerSourceIds,
                        additionalFeatureLayerSources,
                        imageLayerSources,
                        featureLayerSources,
                        layers
                    }
                    return React.createElement(WrappedComponent, {...this.props, ...layerProps})
                }
            },
            withRecipe(mapRecipeToProps),
            connect(mapStateToProps),
            withMapArea()
        )
