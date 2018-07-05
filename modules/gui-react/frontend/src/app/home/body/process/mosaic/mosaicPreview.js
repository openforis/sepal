import {RecipeState, SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import EarthEngineImageLayer from 'app/home/map/earthEngineLayer'
import {sepalMap} from 'app/home/map/map'
import backend from 'backend'
import _ from 'lodash'
import React from 'react'
import {connect} from 'store'
import {msg, Msg} from 'translate'
import Icon from 'widget/icon'
import MapStatus from 'widget/mapStatus'
import styles from './mosaicPreview.module.css'


const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        recipe: recipeState()
    }
}

class MosaicPreview extends React.Component {
    state = {}

    render() {
        const {initializing, tiles, error} = this.state
        if (this.isHidden())
            return null
        else if (error) {
            return (
                <MapStatus loading={false} error={error}/>
            )
        }
        else if (initializing)
            return (
                <MapStatus message={msg('process.mosaic.preview.initializing')}/>
            )
        else if (tiles && (!tiles.complete || tiles.failed))
            return (
                <MapStatus
                    loading={!tiles.complete}
                    message={msg('process.mosaic.preview.loading', {loaded: tiles.loaded, count: tiles.count})}
                    error={tiles.failed ? msg('process.mosaic.preview.tilesFailed', {failed: tiles.failed}) : error}/>
            )
        else
            return null
    }

    onProgress(tiles) {
        this.setState(prevState => ({...prevState, tiles, initializing: false}))
    }

    onError() {
        this.setState(prevState => ({
            ...prevState,
            error:
                <div>
                    <Msg id='process.mosaic.preview.error'/>
                    <div className={styles.retry}>
                        <a
                            href=''
                            onClick={(e) => {
                                e.preventDefault()
                                this.reload()
                            }}>
                            <Icon name='sync'/>
                            <Msg id='button.retry'/>
                        </a>
                    </div>

                </div>
        }))
    }

    reload() {
        const {recipeId} = this.props
        this.setState(prevState => ({...prevState, error: null}))
        sepalMap.getContext(recipeId).setLayer({id: 'preview', layer: null})
    }

    isPreviewShown() {
        const {recipe} = this.props
        return recipe.ui.initialized
            && !recipe.ui.autoSelectingScenes
            && recipe.bands
            && (recipe.sceneSelectionOptions.type === SceneSelectionType.ALL
                || (recipe.scenes && Object.keys(recipe.scenes).find(sceneAreaId => recipe.scenes[sceneAreaId].length > 0)))
    }


    toLayerProps(recipe) {
        return _.omit(recipe, ['ui', 'placeholder', 'title'])
    }

    componentDidUpdate(prevProps) {
        const {recipe} = this.props
        const layerProps = this.toLayerProps(recipe)
        const layerChanged = !_.isEqual(layerProps, this.toLayerProps(prevProps.recipe))
        if (layerChanged)
            this.updateLayer()
        const context = sepalMap.getContext(recipe.id)
        context.hideLayer('preview', this.isHidden(recipe))
    }

    updateLayer() {
        const {recipe, componentWillUnmount$} = this.props
        const {initializing, error} = this.state
        const layer = this.isPreviewShown()
            ? new EarthEngineImageLayer({
                layerIndex: 0,
                bounds: recipe.ui.aoi.bounds,
                mapId$: backend.gee.preview$(recipe),
                props: this.toLayerProps(recipe),
                onProgress: (tiles) => this.onProgress(tiles)
            })
            : null
        const context = sepalMap.getContext(recipe.id)
        const changed = context.setLayer({
            id: 'preview',
            layer,
            destroy$: componentWillUnmount$,
            onError: () => this.onError()
        })
        if (changed && initializing !== !!layer)
            this.setState(prevState => ({...prevState, initializing: !!layer, error: null}))
        else if (changed && error)
            this.setState(prevState => ({...prevState, error: null}))
    }

    isHidden() {
        const {recipe} = this.props
        return !this.isPreviewShown() || !recipe || !recipe.ui || !!recipe.ui.selectedPanel
    }
}

export default connect(mapStateToProps)(MosaicPreview)
