import {Button} from 'widget/button'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import EarthEngineLayer from 'app/home/map/earthEngineLayer'
import MapStatus from 'widget/mapStatus'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import withSubscriptions from 'subscription'

const LABEL = 'mosaic'

const mapRecipeToProps = recipe => ({recipe})

class MosaicPreview extends React.Component {
    state = {
        initializing: false,
        failed: false
    }

    constructor(props) {
        super(props)
        this.progress$ = new Subject()
        const {addSubscription} = props
        addSubscription(
            this.progress$.subscribe(
                tiles => this.setState({tiles, initializing: false})
            )
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
            <MapStatus
                loading={!tiles.complete}
                message={msg(`process.${LABEL}.preview.loading`, {pending: tiles.loading})}
                error={tiles.failed ? msg(`process.${LABEL}.preview.tilesFailed`, {failed: tiles.failed}) : error}/>
        )
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
        return null
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
        const {recipe, mapContext: {sepalMap}} = this.props
        sepalMap.removeLayer('preview')
        this.updateLayer(this.toPreviewRequest(recipe))
    }

    componentDidMount() {
        this.updateLayer(this.toPreviewRequest(this.props.recipe))
    }

    componentDidUpdate(prevProps) {
        const {recipe, mapContext: {sepalMap}} = this.props
        const previewRequest = this.toPreviewRequest(recipe)
        const layerChanged = !_.isEqual(previewRequest, this.toPreviewRequest(prevProps.recipe))
        if (layerChanged) {
            this.updateLayer(previewRequest)
        }
        sepalMap.hideLayer('preview', this.isHidden(recipe))
    }

    // common code above

    updateLayer(previewRequest) {
        if (this.isHidden())
            return
        const {mapContext: {sepalMap}, componentWillUnmount$} = this.props
        const {initializing, error} = this.state
        const layer = new EarthEngineLayer({
            sepalMap,
            layerIndex: 2,
            toggleable: true,
            label: msg('process.radarMosaic.preview.label'),
            description: msg('process.radarMosaic.preview.description'),
            bounds: previewRequest.recipe.model.aoi.bounds,
            mapId$: api.gee.preview$(previewRequest),
            props: previewRequest,
            progress$: this.progress$
        })
        const changed = sepalMap.setLayer({
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
        return recipe.ui.hidePreview || !selectFrom(recipe, 'ui.bands.selection') || recipe.ui.mapOverlayIndex === -1
    }

    toPreviewRequest(recipe) {
        const selection = selectFrom(recipe, 'ui.bands.selection')
        return {
            recipe: _.omit(recipe, ['ui']),
            bands: {selection: selection && selection.split(', ')}
        }
    }
}

MosaicPreview.propTypes = {}

export default compose(
    MosaicPreview,
    withRecipe(mapRecipeToProps),
    withSubscriptions()
)
