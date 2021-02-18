import {Button} from 'widget/button'
import {Legend} from 'widget/legend'
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

const LABEL = 'ccdcSlice'

const mapRecipeToProps = recipe => ({recipe})

class CCDCSlicePreview extends React.Component {
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
                    message={msg(`process.${LABEL}.preview.loading`, {pending: tiles.pending})}
                    error={tiles.failed ? msg(`process.${LABEL}.preview.tilesFailed`, {failed: tiles.failed}) : error}/>
            </React.Fragment>
        )
    }

    renderLegend() {
        const {visParams} = this.state
        if (!visParams || !visParams.palette)
            return null
        return (
            <Legend palette={visParams.palette} min={visParams.min} max={visParams.max}/>
        )
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
        const {mapContext: {sepalMap}, recipe} = this.props
        sepalMap.removeLayer('preview')
        this.updateLayer(this.toPreviewRequest(recipe))
    }

    componentDidMount() {
        this.updateLayer(this.toPreviewRequest(this.props.recipe))
    }

    componentDidUpdate(prevProps) {
        const {mapContext: {sepalMap}, recipe} = this.props
        const previewRequest = this.toPreviewRequest(recipe)
        const layerChanged = !_.isEqual(previewRequest, this.toPreviewRequest(prevProps.recipe))
        if (layerChanged) {
            this.updateLayer(previewRequest)
        }
        sepalMap.hideLayer('preview', this.isHidden(recipe))
    }

    // common code above

    updateLayer(previewRequest) {
        if (this.isHidden()) {
            return
        }
        const {mapContext, componentWillUnmount$} = this.props
        const {initializing, error} = this.state
        const layer = new EarthEngineLayer({
            mapContext,
            layerIndex: 2,
            toggleable: true,
            label: msg('process.ccdcSlice.preview.label'),
            description: msg('process.ccdcSlice.preview.description'),
            // bounds: previewRequest.recipe.model.aoi.bounds, // TODO: Figure out the AOI somehow
            mapId$: api.gee.preview$(previewRequest),
            props: previewRequest,
            progress$: this.progress$
        })
        const sepalMap = mapContext.sepalMap
        const changed = sepalMap.setLayer({
            id: 'preview',
            layer,
            destroy$: componentWillUnmount$,
            onInitialized: ({visParams}) => this.setState({visParams}),
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
        const baseBands = selectFrom(recipe, 'ui.bands.baseBands')
        return {
            recipe: _.omit(recipe, ['ui']),
            bands: {selection: selection && selection.split(', '), baseBands}
        }
    }
}

CCDCSlicePreview.propTypes = {}

export default compose(
    CCDCSlicePreview,
    withRecipe(mapRecipeToProps),
    withSubscriptions()
)
