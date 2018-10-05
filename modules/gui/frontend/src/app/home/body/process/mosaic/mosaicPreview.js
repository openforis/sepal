import {Msg, msg} from 'translate'
import {RecipeState, SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import {connect} from 'store'
import {sepalMap} from 'app/home/map/map'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import Icon from 'widget/icon'
import MapStatus from 'widget/mapStatus'
import React from 'react'
import _ from 'lodash'
import api from 'api'
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
        } else if (initializing)
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
                </div>
        }))
    }

    reload() {
        const {recipe} = this.props
        const context = sepalMap.getContext(recipe.id)
        context.removeLayer('preview')
        this.updateLayer(this.toPreviewRequest(recipe))
    }

    isPreviewShown() {
        const {recipe} = this.props
        return !recipe.ui.autoSelectingScenes
            && (recipe.model.sceneSelectionOptions.type === SceneSelectionType.ALL
                || (recipe.model.scenes
                    && Object.keys(recipe.model.scenes).find(sceneAreaId => recipe.model.scenes[sceneAreaId].length > 0)))
    }

    componentDidMount() {
        this.updateLayer(this.toPreviewRequest(this.props.recipe))
    }

    componentDidUpdate(prevProps) {
        const {recipe} = this.props
        const previewRequest = this.toPreviewRequest(recipe)
        const layerChanged = !_.isEqual(previewRequest, this.toPreviewRequest(prevProps.recipe))
        if (layerChanged)
            this.updateLayer(previewRequest)
        const context = sepalMap.getContext(recipe.id)
        context.hideLayer('preview', this.isHidden(recipe))
    }

    updateLayer(previewRequest) {
        const {recipeId, componentWillUnmount$} = this.props
        const {initializing, error} = this.state
        const layer = this.isPreviewShown()
            ? new EarthEngineLayer({
                layerIndex: 0,
                bounds: previewRequest.recipe.model.aoi.bounds,
                mapId$: api.gee.preview$(previewRequest),
                props: previewRequest,
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
        if (changed && initializing !== !!layer)
            this.setState(prevState => ({...prevState, initializing: !!layer, error: null}))
        else if (changed && error)
            this.setState(prevState => ({...prevState, error: null}))
    }

    isHidden() {
        const {recipe} = this.props
        return !this.isPreviewShown() || !recipe || !recipe.ui || !!recipe.ui.selectedPanel
    }

    toPreviewRequest(recipe) {
        return {
            recipe: _.omit(recipe, ['ui']),
            bands: {
                selection: recipe.ui.bands.selection.split(', '),
                panSharpen: recipe.ui.bands.panSharpen
            }
        }
    }
}

export default connect(mapStateToProps)(MosaicPreview)
