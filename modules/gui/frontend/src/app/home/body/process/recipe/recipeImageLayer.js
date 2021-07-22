import {CCDCSliceImageLayer} from './ccdcSlice/ccdcSliceImageLayer'
import {ClassificationImageLayer} from './classification/classificationImageLayer'
import {OpticalMosaicImageLayer} from './opticalMosaic/opticalMosaicImageLayer'
import {RadarMosaicImageLayer} from './radarMosaic/radarMosaicImageLayer'
import {compose} from 'compose'
import {connect} from 'store'
import {getAllVisualizations} from './visualizations'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from 'app/home/map/mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {withRecipeLayer} from './withRecipeLayer'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

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
        const {recipe, source, layer, layerConfig, map, boundsChanged$, dragging$, cursor$} = this.props
        const props = {
            recipe,
            source,
            layer,
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

    componentDidMount() {
        const {recipe, layerConfig: {visParams}} = this.props
        if (!visParams) {
            this.selectVisualization(getAllVisualizations(recipe)[0])
        }
    }

    componentDidUpdate(prevProps) {
        const {layerConfig: {visParams: prevVisParams}} = prevProps
        const {recipe} = this.props
        const allVisualizations = getAllVisualizations(recipe)
        if (prevVisParams) {
            const visParams = allVisualizations
                .find(({id, bands}) => id === prevVisParams.id && (prevVisParams.id || _.isEqual(bands, prevVisParams.bands)))
            if (!visParams) {
                this.selectVisualization(allVisualizations[0])
            } else if (!_.isEqual(visParams, prevVisParams)) {
                this.selectVisualization(visParams)
            }
        } else {
            this.selectVisualization(allVisualizations[0])
        }
    }

    selectVisualization(visParams) {
        const {layerConfig: {panSharpen}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams, panSharpen})
    }
}

export const RecipeImageLayer = compose(
    _RecipeImageLayer,
    connect(mapStateToProps),
    withRecipe(),
    withRecipeLayer(),
    withMapAreaContext()
)

RecipeImageLayer.propTypes = {
    layerConfig: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    boundsChanged$: PropTypes.any,
    cursor$: PropTypes.any,
    dragging$: PropTypes.any,
    map: PropTypes.object,
}
