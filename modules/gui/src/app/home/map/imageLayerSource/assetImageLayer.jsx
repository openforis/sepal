import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject, take, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {findVisualization, renderableVisualizations, withKnownIdentities} from '~/app/home/body/process/recipe/visualizationMatching'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {assetEvidenceOfState, DEFINITIVE, TRANSIENT} from '~/app/home/body/process/sourceRuntime/assetEvidence'
import {withSourceRuntime} from '~/app/home/body/process/sourceRuntime/sourceRuntimeContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {uuid} from '~/uuid'
import {Notifications} from '~/widget/notifications'
import {withTab} from '~/widget/tabs/tabContext'

import {CursorValueContext} from '../cursorValue'
import {EarthEngineImageLayer} from '../layer/earthEngineImageLayer'
import {LayerSourceStatus} from '../layerSourceStatus'
import {withMapArea} from '../mapAreaContext'
import {MapAreaLayout} from '../mapAreaLayout'
import {assetAvailableBands} from './assetBands'
import {toVisualizations} from './assetVisualizationParser'
import {VisualizationSelector} from './visualizationSelector'

// What the session knows of the asset (assetEvidence.js) and how often it was explicitly refreshed.
const mapStateToProps = (state, {source}) => {
    const asset = source.sourceConfig.asset
    return {
        evidence: assetEvidenceOfState(state)[asset] || null,
        refreshed: state.process?.sourceRefreshes?.assets?.[asset] || 0,
        earthEngineGeneration: state.user?.currentUser?.googleTokens
    }
}

const mapRecipeToProps = (recipe, ownProps) => {
    const {source} = ownProps
    return {
        userDefinedVisualizations: selectFrom(recipe, ['layers.userDefinedVisualizations', source.id]) || []
    }
}

// An Earth Engine asset shown directly. The source runtime keeps what is known of it recent while it is shown
// (assetRefresh.js); its metadata - bands and presets - is read again when that reports another token, when the asset
// is refreshed explicitly and when the credentials change, and the preview is drawn again for the same reasons. A change
// nothing reports stays unseen until an explicit refresh. The saved sourceConfig is an identity seed, not freshness
// evidence.
//
// An asset found missing or unreadable is withheld and named. A drawing already shown is kept while metadata is read
// again or could not be read for now - after replaced credentials too, which change how later requests authenticate,
// not the pixels shown - as long as nothing it was drawn from has changed. What it may authorize is the metadata's to
// say, not the drawing's.
class _AssetImageLayer extends React.Component {
    cursorValue$ = new Subject()
    cancel$ = new Subject()
    state = {metadata: null, visualizations: [], basis: null, loading: false, refreshing: false}
    mounted = false

    constructor(props) {
        super(props)
        this.refresh = this.refresh.bind(this)
    }

    render() {
        const {map} = this.props
        return (
            <CursorValueContext cursorValue$={this.cursorValue$}>
                <LayerSourceStatus status={this.sourceStatus()}>
                    <MapAreaLayout
                        layer={this.maybeCreateLayer()}
                        form={this.renderImageLayerForm()}
                        map={map}
                    />
                </LayerSourceStatus>
            </CursorValueContext>
        )
    }

    sourceStatus() {
        const {source, evidence} = this.props
        const {loading, refreshing} = this.state
        const asset = source.sourceConfig.asset
        return {
            checking: Boolean(evidence?.checking && (evidence.failure || evidence.stale)),
            unavailable: evidence?.failure?.kind === DEFINITIVE ? asset : null,
            failing: evidence?.failure?.kind === TRANSIENT && !evidence.checking ? asset : null,
            refresh: this.refresh,
            refreshing: refreshing || loading
        }
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
            />
        )
    }

    componentDidMount() {
        this.mounted = true
        this.claim()
        this.loadMetadata()
    }

    componentDidUpdate() {
        if (this.claimed !== this.props.source.sourceConfig.asset) {
            this.claim()
        }
        this.adoptFirstVersion()
        if (!this.isCurrent(this.requested)) {
            this.loadMetadata()
        } else {
            this.reconcileVisualization()
        }
    }

    componentWillUnmount() {
        this.mounted = false
        this.release?.()
        this.cancel$.next()
        this.cancel$.complete()
    }

    claim() {
        const {source, sourceRuntime} = this.props
        const previous = this.release
        this.claimed = source.sourceConfig.asset
        this.release = sourceRuntime?.claimAssets([this.claimed])
        previous?.()
    }

    // Reads the asset's evidence and metadata again and draws it again, even when nothing reported a change.
    refresh() {
        const {source, sourceRuntime} = this.props
        if (!sourceRuntime) {
            return this.loadMetadata()
        }
        this.setState({refreshing: true})
        sourceRuntime.refreshAsset(source.sourceConfig.asset)
            .finally(() => this.mounted && this.setState({refreshing: false}))
    }

    isCurrent(basis) {
        const {source, refreshed, earthEngineGeneration} = this.props
        const version = this.knownVersion()
        return basis && basis.sourceId === source.id && basis.asset === source.sourceConfig.asset
            && basis.refreshed === refreshed && basis.earthEngineGeneration === earthEngineGeneration
            && (basis.version === undefined || version === undefined || basis.version === version)
    }

    // A token first learned after the metadata was read is no change: the read found what that token describes, so
    // the basis takes it, and the next token that differs is one.
    adoptFirstVersion() {
        const version = this.knownVersion()
        if (this.requested && this.requested.version === undefined && version !== undefined) {
            this.requested.version = version
        }
    }

    knownVersion() {
        const {evidence} = this.props
        return !evidence || evidence.checkedAt === null ? undefined : evidence.version
    }

    loadMetadata() {
        const {source, refreshed, earthEngineGeneration, addSubscription, layerConfig, sourceRuntime} = this.props
        const asset = source.sourceConfig.asset
        const basis = {asset, sourceId: source.id, version: this.knownVersion(), refreshed, earthEngineGeneration}
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
                    this.setState({loading: false})
                    sourceRuntime?.reportFailure({error, assets: [asset]})
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
        return assetAvailableBands(this.currentMetadata())
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
        const {layerConfig, map, evidence} = this.props
        if (evidence?.failure?.kind === DEFINITIVE) {
            this.layer = null
            return null
        }
        const selected = findVisualization(this.allVisualizations(), layerConfig?.visParams)
        if (map && selected && _.isEqual(selected, layerConfig.visParams)) {
            return this.createLayer()
        }
        if (map && this.layer && !this.currentMetadata() && sameAssetDrawing(this.layer.watchedProps, this.drawing())) {
            return this.layer
        }
        // MapAreaLayout removes and cancels the old layer; it cannot be reused on recovery.
        this.layer = null
        return null
    }

    // What a drawing is drawn from: the asset and how it is visualized, when the asset was last seen to change and how
    // often it was refreshed.
    drawing() {
        const {layerConfig, source, evidence, refreshed} = this.props
        return {
            previewRequest: {recipe: {type: 'ASSET', id: selectFrom(source, 'sourceConfig.asset')}, ...layerConfig},
            pixels: {changedAt: evidence?.changedAt ?? null, refreshed}
        }
    }

    createLayer() {
        const {layerConfig, map, source, sourceRuntime, boundsChanged$, dragging$, cursor$, tab: {busy}} = this.props
        const asset = selectFrom(source, 'sourceConfig.asset')
        const dataTypes = _.mapValues(this.availableBands(), 'dataType')
        const watchedProps = this.drawing()
        const {previewRequest} = watchedProps
        if (!this.layer || !sameAssetDrawing(this.layer.watchedProps, watchedProps)) {
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
                cursor$,
                onError: error => sourceRuntime?.reportFailure({error, assets: [asset]})
            })
        }
        return this.layer
    }
}

// An asset whose change is unknown now - its evidence not read again yet, or cleared with replaced credentials - has not
// changed.
const sameAssetDrawing = (drawn, current) =>
    _.isEqual(drawn.previewRequest, current.previewRequest)
    && drawn.pixels.refreshed === current.pixels.refreshed
    && (current.pixels.changedAt === null || current.pixels.changedAt === drawn.pixels.changedAt)

export const AssetImageLayer = compose(
    _AssetImageLayer,
    withSubscriptions(),
    connect(mapStateToProps),
    withSourceRuntime(),
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
