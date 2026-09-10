import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject, take, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {findVisualization, renderableVisualizations, withKnownIdentities} from '~/app/home/body/process/recipe/visualizationMatching'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {uuid} from '~/uuid'
import {Button} from '~/widget/button'
import {Notifications} from '~/widget/notifications'
import {withTab} from '~/widget/tabs/tabContext'

import {CursorValueContext} from '../cursorValue'
import {EarthEngineImageLayer} from '../layer/earthEngineImageLayer'
import {withMapArea} from '../mapAreaContext'
import {MapAreaLayout} from '../mapAreaLayout'
import {toVisualizations} from './assetVisualizationParser'
import {VisualizationSelector} from './visualizationSelector'

const mapStateToProps = (state, {source}) => ({
    assetVersion: [...(state.assets?.user || []), ...(state.assets?.other || [])]
        .find(({id}) => id === source.sourceConfig.asset)?.updateTime,
    earthEngineGeneration: state.user?.currentUser?.googleTokens
})

const mapRecipeToProps = (recipe, ownProps) => {
    const {source} = ownProps
    return {
        userDefinedVisualizations: selectFrom(recipe, ['layers.userDefinedVisualizations', source.id]) || []
    }
}

class _AssetImageLayer extends React.Component {
    cursorValue$ = new Subject()
    cancel$ = new Subject()
    state = {metadata: null, visualizations: [], basis: null, loading: false}

    render() {
        const {map} = this.props
        return (
            <CursorValueContext cursorValue$={this.cursorValue$}>
                <MapAreaLayout
                    layer={this.maybeCreateLayer()}
                    form={this.renderImageLayerForm()}
                    map={map}
                />
            </CursorValueContext>
        )
    }

    renderImageLayerForm() {
        const {source, layerConfig = {}} = this.props
        const recipe = {
            type: 'ASSET',
            id: source.sourceConfig.asset
        }
        const visParamsToOption = visParams => ({
            value: visParams.id,
            label: visParams.bands.join(', '),
            visParams
        })
        const visualizations = this.currentMetadata() ? this.state.visualizations : []
        const options = [{
            label: msg('map.layout.addImageLayerSource.types.Asset.presets'),
            options: visualizations.map(visParamsToOption)
        }]
        return (
            <VisualizationSelector
                source={source}
                recipe={recipe}
                presetOptions={options}
                availableBands={this.availableBands()}
                selectedVisParams={layerConfig.visParams}
                labelButtons={[this.renderRefreshButton()]}
            />
        )
    }

    renderRefreshButton() {
        const {loading} = this.state
        return (
            <Button
                key='refresh'
                chromeless
                shape='circle'
                size='small'
                icon='rotate'
                iconAttributes={{spin: loading}}
                tooltip={msg('imageLayerSources.Asset.refresh.tooltip')}
                disabled={loading}
                onClick={() => this.loadMetadata()}
            />
        )
    }

    componentDidMount() {
        this.loadMetadata()
    }

    componentDidUpdate() {
        if (!this.isCurrent(this.requested)) {
            this.loadMetadata()
        } else {
            this.reconcileVisualization()
        }
    }

    componentWillUnmount() {
        this.cancel$.next()
        this.cancel$.complete()
    }

    isCurrent(basis) {
        const {source, assetVersion, earthEngineGeneration} = this.props
        return basis && basis.sourceId === source.id && basis.asset === source.sourceConfig.asset
            && basis.assetVersion === assetVersion && basis.earthEngineGeneration === earthEngineGeneration
    }

    // The saved sourceConfig is an identity seed, not freshness evidence. Every accepted read also
    // renews the preview: unchanged metadata can describe replaced pixels.
    loadMetadata() {
        const {source, assetVersion, earthEngineGeneration, addSubscription, layerConfig} = this.props
        const asset = source.sourceConfig.asset
        const basis = {asset, sourceId: source.id, assetVersion, earthEngineGeneration, read: uuid()}
        const previous = this.state.basis?.asset === asset
            ? this.state.visualizations
            : source.sourceConfig.visualizations
        const selected = layerConfig?.visParams
        const known = _.uniqBy([
            ...(previous || []),
            ...(selected && !selected.userDefined ? [selected] : [])
        ], 'id')
        this.cancel$.next()
        this.requested = basis
        this.setState({loading: true})
        addSubscription(api.gee.assetMetadata$({asset, allowedTypes: ['Image', 'ImageCollection']}).pipe(
            takeUntil(this.cancel$),
            take(1)
        ).subscribe({
            next: metadata => {
                if (this.requested === basis && this.isCurrent(basis)) {
                    const visualizations = withKnownIdentities(
                        toVisualizations(metadata.properties || {}, metadata.bandNames || [])
                            .map(visualization => ({...visualization, id: uuid()})),
                        known
                    )
                    this.setState({basis, metadata, visualizations, loading: false})
                }
            },
            error: error => {
                if (this.requested === basis && this.isCurrent(basis)) {
                    this.setState({metadata: null, loading: false})
                    Notifications.error({
                        message: msg('imageLayerSources.Asset.refresh.failed'),
                        error: toUserErrorMessage(error)
                    })
                }
            }
        }))
    }

    currentMetadata() {
        return this.state.basis === this.requested && this.isCurrent(this.state.basis) ? this.state.metadata : null
    }

    availableBands() {
        const metadata = this.currentMetadata()
        return Object.fromEntries((metadata?.bandNames || []).map(name => {
            const band = metadata.bands?.find(({id}) => id === name)
            return [name, {dataType: {...band?.data_type, arrayDimensions: band?.data_type?.dimensions}}]
        }))
    }

    allVisualizations() {
        const {userDefinedVisualizations} = this.props
        return renderableVisualizations([
            ...userDefinedVisualizations,
            ...this.state.visualizations
        ], this.availableBands())
    }

    reconcileVisualization() {
        const {layerConfig: {visParams} = {}, mapArea: {updateLayerConfig}} = this.props
        const visualizations = this.allVisualizations()
        const selected = visParams ? findVisualization(visualizations, visParams) : visualizations[0]
        if (selected && !_.isEqual(selected, visParams)) {
            updateLayerConfig({visParams: selected})
        }
    }

    maybeCreateLayer() {
        const {layerConfig, map} = this.props
        const selected = findVisualization(this.allVisualizations(), layerConfig?.visParams)
        if (map && selected && _.isEqual(selected, layerConfig.visParams)) {
            return this.createLayer()
        }
        // MapAreaLayout removes and cancels the old layer; it cannot be reused on recovery.
        this.layer = null
        return null
    }

    createLayer() {
        const {layerConfig, map, source, boundsChanged$, dragging$, cursor$, tab: {busy}} = this.props
        const asset = selectFrom(source, 'sourceConfig.asset')
        const dataTypes = _.mapValues(this.availableBands(), 'dataType')
        const {watchedProps: previous} = this.layer || {}
        const previewRequest = {
            recipe: {
                type: 'ASSET',
                id: asset
            },
            ...layerConfig
        }
        const watchedProps = {previewRequest, assetRead: this.state.basis.read}
        if (!_.isEqual(watchedProps, previous)) {
            this.layer = new EarthEngineImageLayer({
                previewRequest,
                watchedProps,
                visParams: layerConfig.visParams,
                dataTypes,
                map,
                cursorValue$: this.cursorValue$,
                busy,
                boundsChanged$,
                dragging$,
                cursor$
            })
        }
        return this.layer
    }
}

export const AssetImageLayer = compose(
    _AssetImageLayer,
    withSubscriptions(),
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps),
    withMapArea(),
    withTab()
)

AssetImageLayer.propTypes = {
    source: PropTypes.any.isRequired,
    boundsChanged$: PropTypes.any,
    cursor$: PropTypes.any,
    dragging$: PropTypes.any,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
