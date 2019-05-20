import {Button} from 'widget/button'
import {SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import {enabled} from 'widget/enableWhen'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {sepalMap} from 'app/home/map/map'
import {withRecipe} from 'app/home/body/process/recipeContext'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import MapStatus from 'widget/mapStatus'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import api from 'api'

const mapRecipeToProps = recipe => ({recipe})

class MosaicPreview extends React.Component {
    state = {
        initializing: false,
        failed: false
    }

    renderInitializing() {
        return (
            <MapStatus message={msg('process.mosaic.preview.initializing')}/>
        )
    }

    renderLoading() {
        const {tiles, error} = this.state
        return (
            <MapStatus
                loading={!tiles.complete}
                message={msg('process.mosaic.preview.loading', {loaded: tiles.loaded, count: tiles.count})}
                error={tiles.failed ? msg('process.mosaic.preview.tilesFailed', {failed: tiles.failed}) : error}/>
        )
    }

    render() {
        const {initializing, tiles, failed} = this.state
        if (this.isHidden() || failed) {
            return null
        }
        if (initializing) {
            this.renderInitializing()
        }
        if (tiles && !tiles.complete) {
            this.renderLoading()
        }
        return null
    }

    onProgress(tiles) {
        this.setState({tiles, initializing: false})
    }

    onError(e) {
        this.setState({failed: true})
        Notifications.error({
            title: msg('gee.error.title'),
            message: msg('process.mosaic.preview.error'),
            error: e.response ? msg(e.response.code, e.response.data) : null,
            timeout: 0,
            content: dismiss =>
                <Button
                    look='transparent'
                    shape='pill'
                    icon='sync'
                    label={msg('button.retry')}
                    onClick={() => {
                        dismiss()
                        this.reload()
                    }}
                />
        })
    }

    reload() {
        const {recipe} = this.props
        const context = sepalMap.getContext(recipe.id)
        context.removeLayer('preview')
        this.updateLayer(this.toPreviewRequest(recipe))
    }

    componentDidMount() {
        this.updateLayer(this.toPreviewRequest(this.props.recipe))
    }

    componentDidUpdate(prevProps) {
        const {recipe} = this.props
        const context = sepalMap.getContext(recipe.id)
        const previewRequest = this.toPreviewRequest(recipe)
        const layerChanged = !_.isEqual(previewRequest, this.toPreviewRequest(prevProps.recipe))
        if (layerChanged)
            this.updateLayer(previewRequest)
        context.hideLayer('preview', this.isHidden(recipe))
    }

    updateLayer(previewRequest) {
        const {recipe, componentWillUnmount$} = this.props
        const {initializing, error} = this.state
        const layer = new EarthEngineLayer({
            layerIndex: 0,
            bounds: previewRequest.recipe.model.aoi.bounds,
            mapId$: api.gee.preview$(previewRequest),
            props: previewRequest,
            onProgress: tiles => this.onProgress(tiles)
        })
        this.setState({failed: false})
        const context = sepalMap.getContext(recipe.id)
        const changed = context.setLayer({
            id: 'preview',
            layer,
            destroy$: componentWillUnmount$,
            onError: e => this.onError(e)
        })
        if (changed && initializing !== !!layer)
            this.setState({initializing: !!layer, error: null})
        else if (changed && error)
            this.setState({error: null})
    }

    isHidden() {
        const {recipe} = this.props
        return recipe.ui.hidePreview
    }

    toPreviewRequest(recipe) {
        return {
            recipe: _.omit(recipe, ['ui']),
            bands: {
                selection: recipe.ui.bands.selection.split(', '),
                panSharpen: !!recipe.ui.bands.panSharpen
            }
        }
    }
}

const hasScenes = ({recipe}) => {
    const type = selectFrom(recipe, 'model.sceneSelectionOptions.type')
    const scenes = selectFrom(recipe, 'model.scenes') || {}
    return type !== SceneSelectionType.SELECT || Object.values(scenes)
        .find(scenes => scenes.length)
}

const removeLayer = ({recipe}) => {
    const context = sepalMap.getContext(recipe.id)
    context.removeLayer('preview')
}

MosaicPreview.propTypes = {}

export default (
    withRecipe(mapRecipeToProps)(
        enabled({when: hasScenes, onDisable: removeLayer})(
            MosaicPreview
        )
    )
)
