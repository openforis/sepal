import {Msg, msg} from 'translate'
import {RecipeState} from 'app/home/body/process/classification/classificationRecipe'
import {connect} from 'store'
import {sepalMap} from 'app/home/map/map'
import EarthEngineImageLayer from 'app/home/map/earthEngineLayer'
import Icon from 'widget/icon'
import MapStatus from 'widget/mapStatus'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import styles from 'app/home/body/process/classification/classificationPreview.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        recipe: recipeState()
    }
}

class ClassificationPreview extends React.Component {
    state = {}

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
                <MapStatus message={msg('process.classification.preview.initializing')}/>
            )
        else if (tiles && (!tiles.complete || tiles.failed))
            return (
                <MapStatus
                    loading={!tiles.complete}
                    message={msg('process.classification.preview.loading', {loaded: tiles.loaded, count: tiles.count})}
                    error={tiles.failed ? msg('process.classification.preview.tilesFailed', {failed: tiles.failed}) : error}/>
            )
        else
            return null
    }

    updateLayer(previewRequest) {
        const {recipeId, componentWillUnmount$} = this.props
        const {initializing, error} = this.state
        const layer = new EarthEngineImageLayer({
            layerIndex: 0, // TODO: Figure out bounds
            mapId$: api.gee.preview$(previewRequest),
            props: previewRequest,
            onProgress: (tiles) => this.onProgress(tiles)
        })
        const context = sepalMap.getContext(recipeId)
        const changed = context.setLayer({
            id: 'preview',
            layer,
            destroy$: componentWillUnmount$,
            // onError: () => this.onError()
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

    onError() {
        this.setState(prevState => ({
            ...prevState,
            error:
                <div>
                    <Msg id='process.classification.preview.error'/>
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

    toPreviewRequest(recipe) {
        return {
            recipe: _.omit(recipe, ['ui'])
        }
    }
}

ClassificationPreview.propTypes = {
    recipeId: PropTypes.string.isRequired
}

export default connect(mapStateToProps)(ClassificationPreview)
