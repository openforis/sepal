import {OpticalMosaicImageLayer} from './opticalMosaic/opticalMosaicImageLayer'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {selectFrom} from 'stateUtils'
import {setActive, setComplete} from 'app/home/map/progress'
import {withRecipe} from '../recipeContext'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import withSubscriptions from 'subscription'

const mapStateToProps = (state, {source: {sourceConfig: {recipeId}}}) => ({
    recipe: selectFrom(state, ['process.loadedRecipes', recipeId])
})

class _RecipeImageLayer extends React.Component {
    progress$ = new Subject()

    render() {
        const {recipe} = this.props
        return recipe
            ? this.renderRecipeMap()
            : null
    }

    renderRecipeMap() {
        const {recipe, source, layerConfig, map} = this.props
        switch(recipe.type) {
        case 'MOSAIC': return (
            <OpticalMosaicImageLayer
                recipe={recipe}
                source={source}
                layerConfig={layerConfig}
                layer={this.maybeCreateLayer()}
                map={map}/>
        )
        default: throw Error(`Unsupported recipe type: ${recipe.type}`)
        }
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(this.progress$.subscribe(
            ({complete}) => complete
                ? this.setComplete('tiles')
                : this.setActive('tiles')
        ))
    }

    componentWillUnmount() {
        this.setComplete('initialize')
        this.setComplete('tiles')
    }

    maybeCreateLayer() {
        const {recipe, layerConfig, map} = this.props
        return map && recipe.ui.initialized
            ? this.createLayer(recipe, layerConfig, map)
            : null
    }

    createLayer(recipe, layerConfig, map) {
        return EarthEngineLayer.fromRecipe({
            recipe: _.omit(recipe, ['ui', 'layers']),
            layerConfig,
            map,
            progress$: this.progress$,
            onInitialize: () => this.setActive('initialize'),
            onInitialized: () => this.setComplete('initialize')
        })
    }

    setActive(name) {
        const {recipeActionBuilder, componentId} = this.props
        setActive(`${name}-${componentId}`, recipeActionBuilder)
    }

    setComplete(name) {
        const {recipeActionBuilder, componentId} = this.props
        setComplete(`${name}-${componentId}`, recipeActionBuilder)
    }
}

export const RecipeImageLayer = compose(
    _RecipeImageLayer,
    connect(mapStateToProps),
    withRecipe(),
    withSubscriptions()
)

RecipeImageLayer.propTypes = {
    layerConfig: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    map: PropTypes.object
}
