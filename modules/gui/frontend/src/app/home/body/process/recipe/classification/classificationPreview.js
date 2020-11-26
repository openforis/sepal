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

const LABEL = 'classification'

const mapRecipeToProps = recipe => ({
    countPerClass: selectFrom(recipe, 'ui.collect.countPerClass'),
    recipe
})

class ClassificationPreview extends React.Component {
    state = {
        initializing: false,
        failed: false,
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
                    message={msg(`process.${LABEL}.preview.loading`, {loaded: tiles.loaded, count: tiles.count})}
                    error={tiles.failed ? msg(`process.${LABEL}.preview.tilesFailed`, {failed: tiles.failed}) : error}/>
            </React.Fragment>
        )
    }

    renderLegend() {
        const {visParams} = this.state
        if (!visParams)
            return null
        return (
            <Legend palette={visParams.palette} min={visParams.min} max={visParams.max}/>
        )
    }

    hasTrainingData() {
        const {countPerClass = {}} = this.props
        return Object.values(countPerClass).filter(count => count > 0).length >= 2
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
        const {mapContext, componentWillUnmount$} = this.props
        if (!this.hasTrainingData()) {
            mapContext.sepalMap.removeLayer('preview')
            return
        }

        const {initializing, error} = this.state
        const layer = new EarthEngineLayer({
            mapContext,
            layerIndex: 2,
            toggleable: true,
            label: msg('process.classification.preview.label'),
            description: msg('process.classification.preview.description'),
            mapId$: api.gee.preview$(previewRequest),
            props: previewRequest,
            progress$: this.progress$
        })
        const changed = mapContext.sepalMap.setLayer({
            id: 'preview',
            layer,
            destroy$: componentWillUnmount$,
            onInitialized: ({visParams}) => this.setState({visParams}),
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
    withRecipe(mapRecipeToProps),
    withSubscriptions()
)
