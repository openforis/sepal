import {RecipeState, SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import EarthEngineImageLayer from 'app/home/map/earthEngineLayer'
import {sepalMap} from 'app/home/map/map'
import backend from 'backend'
import _ from 'lodash'
import React from 'react'
import {connect} from 'store'
import {msg} from 'translate'
import MapStatus from 'widget/mapStatus'


const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        recipe: recipe()
    }
}

class MosaicPreview extends React.Component {
    state = {}

    render() {
        const {initializing, tiles} = this.state
        if (this.isHidden())
            return null
        if (initializing)
            return (
                <MapStatus message={msg('process.mosaic.preview.initializing')}/>
            )
        else if (tiles && !tiles.complete)
            return (
                <MapStatus
                    message={msg('process.mosaic.preview.loading', {loaded: tiles.loaded, count: tiles.count})}
                    error={tiles.failed ? msg('process.mosaic.preview.failed', {failed: tiles.failed}) : null}/>
            )
        else
            return null
    }

    onProgress(tiles) {
        this.setState(prevState => ({...prevState, tiles, initializing: false}))
    }

    isPreviewShown() {
        const {recipe} = this.props
        return recipe.ui.initialized
            && (recipe.sceneSelectionOptions.type === SceneSelectionType.ALL
                || (recipe.scenes && recipe.scenes.length > 0))
    }

    componentDidUpdate() {
        const {recipeId, recipe, componentWillUnmount$} = this.props
        const {initializing} = this.state
        const layer = this.isPreviewShown()
            ? new EarthEngineImageLayer({
                bounds: recipe.aoi.bounds,
                mapId$: backend.gee.preview$(recipe),
                props: _.omit(recipe, 'ui'),
                onProgress: (tiles) => this.onProgress(tiles)
            })
            : null
        const context = sepalMap.getContext(recipeId)
        const changed = context.setLayer({id: 'preview', layer, destroy$: componentWillUnmount$})
        context.hideLayer('preview', this.isHidden(recipe))
        if (changed && initializing !== !!layer)
            this.setState(prevState => ({...prevState, initializing: !!layer}))

    }

    isHidden() {
        const {recipe} = this.props
        return !this.isPreviewShown() || !recipe || !recipe.ui || !!recipe.ui.selectedPanel
    }
}

export default connect(mapStateToProps)(MosaicPreview)
