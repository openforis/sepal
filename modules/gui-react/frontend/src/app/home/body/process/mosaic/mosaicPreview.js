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
    const recipe = RecipeState(ownProps.recipeId)
    return {
        recipe: recipe()
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
        else if (tiles && !tiles.complete)
            return (
                <MapStatus
                    loading={!tiles.failed}
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
            && (recipe.sceneSelectionOptions.type === SceneSelectionType.ALL
                || (recipe.scenes && Object.keys(recipe.scenes).find(sceneAreaId => recipe.scenes[sceneAreaId].length > 0)))
    }

    componentDidUpdate() {
        const {recipeId, recipe, componentWillUnmount$} = this.props
        const {error} = this.state
        const {initializing} = this.state
        if (this.isPreviewShown())
            console.log('preview is shown', this.props.recipe.scenes)
        const layer = this.isPreviewShown()
            ? new EarthEngineImageLayer({
                bounds: recipe.aoi.bounds,
                mapId$: backend.gee.preview$(recipe),
                props: _.omit(recipe, 'ui'),
                onProgress: (tiles) => this.onProgress(tiles)
            })
            : null
        const context = sepalMap.getContext(recipeId)
        const changed = context.setLayer({
            id: 'preview',
            layer,
            destroy$: componentWillUnmount$,
            onError: () => this.onError()
        })
        context.hideLayer('preview', this.isHidden(recipe))
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
