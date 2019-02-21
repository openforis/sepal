import api from 'api'
import styles from 'app/home/body/process/changeDetection/changeDetectionPreview.module.css'
import {withRecipe} from 'app/home/body/process/recipeContext'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import {sepalMap} from 'app/home/map/map'
import _ from 'lodash'
import React from 'react'
import {msg} from 'translate'
import {Button} from 'widget/button'
import MapStatus from 'widget/mapStatus'

const mapRecipeToProps = recipe => ({recipe})

class ChangeDetectionPreview extends React.Component {
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
                <MapStatus message={msg('process.changeDetection.preview.initializing')}/>
            )
        else if (tiles && (!tiles.complete || tiles.failed))
            return (
                <MapStatus
                    loading={!tiles.complete}
                    message={msg('process.changeDetection.preview.loading', {loaded: tiles.loaded, count: tiles.count})}
                    error={tiles.failed ? msg('process.changeDetection.preview.tilesFailed', {failed: tiles.failed}) : error}/>
            )
        else
            return null
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
        const {recipe, componentWillUnmount$} = this.props
        const {initializing, error} = this.state
        const layer = new EarthEngineLayer({
            layerIndex: 1,
            mapId$: api.gee.preview$(previewRequest),
            props: previewRequest,
            onProgress: tiles => this.onProgress(tiles)
        })
        const context = sepalMap.getContext(recipe.id)
        const changed = context.setLayer({
            id: 'preview',
            layer,
            destroy$: componentWillUnmount$,
            onError: (e) => this.onError(e)
        })
        if (changed && initializing !== !!layer)
            this.setState(prevState => ({...prevState, initializing: !!layer, error: null}))
        else if (changed && error)
            this.setState(prevState => ({...prevState, error: null}))
    }

    reload() {
        const {recipe} = this.props
        const context = sepalMap.getContext(recipe.id)
        context.removeLayer('preview')
        this.updateLayer(this.toPreviewRequest(recipe))
    }

    isHidden() {
        const {recipe} = this.props
        return !!recipe.ui.selectedPanel
    }

    onProgress(tiles) {
        this.setState(prevState => ({...prevState, tiles, initializing: false}))
    }

    onError(e) {
        const message = e.response && e.response.code
            ? msg(e.response.code, e.response.data)
            : msg('process.changeDetection.preview.error')
        this.setState(prevState => ({
            ...prevState,
            error:
                <div>
                    {message}
                    <div className={styles.retry}>
                        <Button
                            chromeless
                            look='transparent'
                            shape='pill'
                            icon='sync'
                            label={msg('button.retry')}
                            onClick={() => this.reload()}
                        />
                    </div>
                </div>
        }))
    }

    toPreviewRequest(recipe) {
        return {
            recipe: _.omit(recipe, ['ui'])
        }
    }
}

ChangeDetectionPreview.propTypes = {}

export default withRecipe(mapRecipeToProps)(ChangeDetectionPreview)
