import {Button} from 'widget/button'
import {compose} from 'compose'
import {msg} from 'translate'
import {sepalMap} from 'app/home/map/map'
import {withRecipe} from 'app/home/body/process/recipeContext'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import MapStatus from 'widget/mapStatus'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import {selectFrom} from '../../../../../stateUtils'
import {Legend} from 'widget/legend'

const LABEL = 'classification'

const mapRecipeToProps = recipe => ({recipe})

class ClassificationPreview extends React.Component {
    state = {
        initializing: false,
        failed: false
    }

    render() {
        const {initializing, tiles, failed} = this.state
        if (this.isHidden() || failed) {
            return null
        }
        if (initializing) {
            return this.renderInitializing()
        }
        if (tiles && !tiles.complete) {
            return this.renderLoading()
        }
        return this.renderLegend()
    }

    renderLegend() {
        const {visParams} = this.state
        if (!visParams)
            return null
        return (
            <Legend palette={visParams.palette} min={visParams.min} max={visParams.max}/>
        )
    }

    renderInitializing() {
        return (
            <MapStatus message={msg(`process.${LABEL}.preview.initializing`)}/>
        )
    }

    renderLoading() {
        const {tiles, error} = this.state
        return (
            <React.Fragment>
                {this.renderLegend()}
                <MapStatus
                    loading={!tiles.complete}
                    message={msg(`process.${LABEL}.preview.loading`, {loaded: tiles.loaded, count: tiles.count})}
                    error={tiles.failed ? msg(`process.${LABEL}.preview.tilesFailed`, {failed: tiles.failed}) : error}/>
            </React.Fragment>
        )
    }

    onProgress(tiles) {
        this.setState({tiles, initializing: false})
    }

    onError(e) {
        this.setState({failed: true})
        Notifications.error({
            title: msg('gee.error.title'),
            message: msg(`process.${LABEL}.preview.error`),
            error: e.response ? msg(e.response.messageKey, e.response.messageArgs, e.response.defaultMessage) : null,
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
        const previewRequest = this.toPreviewRequest(recipe)
        const layerChanged = !_.isEqual(previewRequest, this.toPreviewRequest(prevProps.recipe))
        if (layerChanged)
            this.updateLayer(previewRequest)
        sepalMap.getContext(recipe.id).hideLayer('preview', this.isHidden(recipe))
    }

    // common code above

    updateLayer(previewRequest) {
        const {recipe, componentWillUnmount$} = this.props
        if (!selectFrom(recipe, 'ui.bands.selection'))
            return

        const {initializing, error} = this.state
        const layer = new EarthEngineLayer({
            layerIndex: 2,
            toggleable: true,
            label: msg('process.classification.preview.label'),
            description: msg('process.classification.preview.description'),
            mapId$: api.gee.preview$(previewRequest),
            props: previewRequest,
            onProgress: tiles => this.onProgress(tiles),
            onInitialized: visParams => this.setState({visParams})
        })
        const context = sepalMap.getContext(recipe.id)
        const changed = context.setLayer({
            id: 'preview',
            layer,
            destroy$: componentWillUnmount$,
            onError: e => this.onError(e)
        })
        this.setState({failed: false})
        if (changed && initializing !== !!layer)
            this.setState({initializing: !!layer, error: null})
        else if (changed && error)
            this.setState({error: null})
    }

    isHidden() {
        const {recipe} = this.props
        return recipe.ui.hidePreview || recipe.ui.overlayIndex === -1
    }

    toPreviewRequest(recipe) {
        const selection = selectFrom(recipe, 'ui.bands.selection')
        return {
            recipe: _.omit(recipe, ['ui']),
            bands: {selection: [selection]}

        }
    }
}

ClassificationPreview.propTypes = {}

export default compose(
    ClassificationPreview,
    withRecipe(mapRecipeToProps)
)
