import PropTypes from 'prop-types'
import React from 'react'

import {recipeType} from '#sepal/recipe/recipeTypeRegistry'
import {inputImageryRequirement} from '#sepal/recipe/source/inputImagery'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {withSubscriptions} from '~/subscription'
import {withTab} from '~/widget/tabs/tabContext'

import {EarthEngineTableLayer} from './layer/earthEngineTableLayer'

class _RecipeGeometryLayer extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.setLayer()
    }

    componentDidUpdate(prevProps) {
        const {id, map, opacity} = this.props
        // Opacity is client-side only and deliberately excluded from watchedProps, so an opacity-only change
        // leaves the layer equal (no recreation, no map-id refetch). Push the new opacity onto the live
        // layer's tiles directly.
        if (prevProps.opacity !== opacity) {
            map.getLayer(id)?.setOpacity?.(opacity)
        }
        this.setLayer()
    }

    componentWillUnmount() {
        const {id, map} = this.props
        map.removeLayer(id)
    }

    // A layer without geometry to show is taken off the map, which cancels the request of the one it replaces.
    setLayer() {
        const {id, map} = this.props
        const layer = this.createLayer()
        if (layer) {
            map.setLayer({id, layer})
        } else {
            map.removeLayer(id)
        }
    }

    createLayer() {
        const {recipe, color, fillColor, width, opacity, layerIndex, map, tab: {busy}} = this.props
        return hasGeometry(recipe)
            ? new EarthEngineTableLayer({
                map,
                mapId$: api.gee.recipeGeometry$({
                    recipe, color, fillColor, width
                }),
                opacity,
                layerIndex,
                // opacity is intentionally excluded: it's applied client-side (setOpacity), so an
                // opacity-only change stays equal and doesn't recreate the layer or refetch the map id.
                watchedProps: {recipe: recipe.model, color, fillColor, width},
                busy
            })
            : null
    }
}

// The geometry of a recipe set up, where what it is read from is there. A recipe that requires input imagery reads its
// geometry from its first input image (lib/js/ee/src/classification/classification.js getGeometry$, and alike), so it
// has none while it lists no image - whatever else keeps it from running, such as missing training data.
const hasGeometry = recipe =>
    recipe.ui.initialized && !lacksInputImagery(recipe)

const lacksInputImagery = recipe =>
    (recipeType(recipe.type)?.configurationRequirements || []).includes(inputImageryRequirement)
    && inputImageryRequirement.findings(recipe.model).length > 0

export const RecipeGeometryLayer = compose(
    _RecipeGeometryLayer,
    withTab(),
    withSubscriptions()
)

RecipeGeometryLayer.propTypes = {
    color: PropTypes.string.isRequired,
    fillColor: PropTypes.string.isRequired,
    id: PropTypes.string.isRequired,
    layerIndex: PropTypes.number.isRequired,
    map: PropTypes.any.isRequired,
    opacity: PropTypes.number,
    recipe: PropTypes.object.isRequired,
    width: PropTypes.number
}
