import {Button} from 'widget/button'
import {SceneSelectionType} from 'app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {enabled} from 'widget/enableWhen'
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

class OpticalMosaicPreview extends React.Component {
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
        if (tiles && tiles.loading) {
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
        const {recipe} = this.props
        this.updateLayer(this.toPreviewRequest(recipe))
    }

    componentDidUpdate(prevProps) {
        const {recipe, mapContext: {sepalMap}} = this.props
        const previewRequest = this.toPreviewRequest(recipe)
        const layerChanged = !_.isEqual(previewRequest, this.toPreviewRequest(prevProps.recipe))
        if (layerChanged)
            this.updateLayer(previewRequest)
        sepalMap.hideLayer('preview', this.isHidden(recipe))
    }

    // componentWillUnmount() {
    //     const {mapContext: {sepalMap}} = this.props
    //     // sepalMap.removeLayer('preview')
    // }

    // common code above

    updateLayer(previewRequest) {
        // console.log('updateLayer', previewRequest)
        const {mapContext: {sepalMap}, componentWillUnmount$} = this.props
        const {initializing, error} = this.state
        const layer = new EarthEngineLayer({
            sepalMap,
            layerIndex: 2,
            toggleable: true,
            label: msg('process.mosaic.preview.label'),
            description: msg('process.mosaic.preview.description'),
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
        this.setState({failed: false})
        if (changed && initializing !== !!layer)
            this.setState({initializing: !!layer, error: null})
        else if (changed && error)
            this.setState({error: null})
    }

    isHidden() {
        const {recipe} = this.props
        return recipe.ui.hidePreview || recipe.ui.mapOverlayIndex === -1
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

const removeLayer = ({mapContext: {sepalMap}}) => {
    sepalMap.removeLayer('preview')
}

OpticalMosaicPreview.propTypes = {}

export default compose(
    OpticalMosaicPreview,
    enabled({when: hasScenes, onDisable: removeLayer}),
    withRecipe(mapRecipeToProps),
    withSubscriptions()
)
