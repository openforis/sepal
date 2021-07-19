import {CCDCSliceImageLayer} from './ccdcSlice/ccdcSliceImageLayer'
import {ClassificationImageLayer} from './classification/classificationImageLayer'
import {OpticalMosaicImageLayer} from './opticalMosaic/opticalMosaicImageLayer'
import {RadarMosaicImageLayer} from './radarMosaic/radarMosaicImageLayer'
import {compose} from 'compose'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../recipeContext'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = (state, {source: {sourceConfig: {recipeId}}}) => ({
    recipe: selectFrom(state, ['process.loadedRecipes', recipeId])
})

class _RecipeImageLayer extends React.Component {
    render() {
        const {recipe} = this.props
        return recipe
            ? this.renderRecipeLayer()
            : null
    }

    renderRecipeLayer() {
        const {recipe, source, layerConfig, map, boundsChanged$, dragging$, cursor$} = this.props
        const props = {
            recipe,
            source,
            layerConfig,
            map,
            boundsChanged$,
            dragging$,
            cursor$
        }
        switch(recipe.type) {
        case 'MOSAIC': return (
            <OpticalMosaicImageLayer {...props}/>
        )
        case 'RADAR_MOSAIC': return (
            <RadarMosaicImageLayer {...props}/>
        )
        case 'CLASSIFICATION': return (
            <ClassificationImageLayer {...props}/>
        )
        case 'CCDC_SLICE': return (
            <CCDCSliceImageLayer {...props}/>
        )
        default: return null
        }
    }
}

export const RecipeImageLayer = compose(
    _RecipeImageLayer,
    connect(mapStateToProps),
    withRecipe()
)

RecipeImageLayer.propTypes = {
    layerConfig: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    boundsChanged$: PropTypes.any,
    cursor$: PropTypes.any,
    dragging$: PropTypes.any,
    map: PropTypes.object,
}
