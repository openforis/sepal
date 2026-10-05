import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject} from 'rxjs'

import {CursorValueContext} from '~/app/home/map/cursorValue'
import {EarthEngineImageLayer} from '~/app/home/map/layer/earthEngineImageLayer'
import {LayerSourceStatus} from '~/app/home/map/layerSourceStatus'
import {withMapArea} from '~/app/home/map/mapAreaContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {Notifications} from '~/widget/notifications'
import {withTab} from '~/widget/tabs/tabContext'

import {getRecipeImageLayer} from '../recipeImageLayerRegistry'
import {getRecipeType} from '../recipeTypeRegistry'
import {assetEvidenceOfState} from '../sourceRuntime/assetEvidence'
import {recordStalenessOfState} from '../sourceRuntime/recordCurrency'
import {withSourceRuntime} from '../sourceRuntime/sourceRuntimeContext'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {OutputWatch} from './outputWatch'
import {pixelGeneration, samePixels} from './pixelGeneration'
import {recipeContent} from './recipeContent'
import {
    ASSET_UNAVAILABLE,
    canPreview,
    displayTypes,
    INVALID,
    layerProduct,
    NEEDS_EVIDENCE,
    productArgs,
    readRecipeOutput,
    READY,
    UNAVAILABLE
} from './recipeOutput'
import {heldSourceStatusOfState} from './selectedSourceStatus'
import {requestGate} from './sourceRequirements'
import {sourceStatus} from './sourceStatus'
import {MATCHED, selectionState} from './visualizationMatching'
import {layerSelection, layerVisualizations} from './visualizations'

// The graph is derived HERE rather than in the component, because an edit to a watched dependency has to
// change these props for the layer to hear about it at all. Reading `process.loadedRecipes` whole is what
// makes that possible; returning the derived graph rather than the object is what keeps an unrelated recipe
// edit from propagating - connect's deep comparison sees identical props and suppresses the update.
//
// A selector runs on every dispatched action, not only on recipe edits, so the adapter caches the graph by the
// identity of `loadedRecipes` and of the root recipe. Unrelated actions reuse it; any recipe edit produces new
// objects and recomputes.
const mapStateToProps = (state, {source: {id, sourceConfig: {recipeId}}, layerConfig, sourceRuntime}) => {
    const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
    const loadedRecipes = selectFrom(state, 'process.loadedRecipes')
    const sourceGate = recipe
        ? requestGate({
            state,
            recipe,
            operation: layerProduct(recipe, layerConfig)?.name,
            evidenceOwnerOf: id => sourceRuntime?.evidenceOwnerOf(id),
            now: Date.now()
        })
        : null
    return {
        sourceId: id,
        recipe,
        dependencyGraph: recipe
            ? buildMapDependencyGraph({recipe, loadedRecipes})
            : null,
        sourceGate,
        heldSource: heldSourceStatusOfState(state, recipe, sourceGate),
        recordStaleness: recordStalenessOfState(state),
        assetEvidence: assetEvidenceOfState(state),
        sourceRefreshes: selectFrom(state, 'process.sourceRefreshes') || NO_REFRESHES
    }
}

const NO_REFRESHES = Object.freeze({})

// Recipe types whose own image layer form reconciles layerConfig.visParams, by the same rule (layerSelection) over the
// presets of the mode it shows. The generic reconciliation below offers the type's presets whatever the mode, so it
// has to stand down for those, or the two writers overwrite each other on every render and React aborts the update
// loop.
export const SELF_MANAGED_VISUALIZATIONS = ['BAYTS_ALERTS', 'CHANGE_ALERTS', 'LANDTRENDR']

// What the layer shows is read, not looked up: the product its config names, answered from the records the session
// holds, and - where that is not enough - from what the source runtime holds for it. The layer watches that question
// while it is mounted, and the runtime loads what the read names, shared with every other consumer asking the same
// (recipeOutput.js, outputWatch.js). Its form, its selector and its visualization editor are given that read, so
// nothing below asks a second authority which bands exist.
//
// The preview is drawn again whenever what its pixels were read from is known to have changed, whether or not its
// description did (pixelGeneration.js): an asset's token, or an explicit refresh. A change nothing reports stays
// unseen until then. Its form is told what is known of those sources and offered an explicit refresh
// (layerSourceStatus.jsx).
class _RecipeImageLayer extends React.Component {
    state = {refreshing: false}
    cursorValue$ = new Subject()
    mounted = false
    watch = new OutputWatch({
        sourceRuntime: this.props.sourceRuntime,
        onChange: () => this.mounted && this.forceUpdate()
    })

    constructor(props) {
        super(props)
        this.refresh = this.refresh.bind(this)
    }

    render() {
        const {recipe} = this.props
        return recipe
            ? (
                <CursorValueContext cursorValue$={this.cursorValue$}>
                    {this.renderRecipeLayer()}
                </CursorValueContext>
            )
            : null
    }

    renderRecipeLayer() {
        const {currentRecipe, recipe, source, layerConfig, map, boundsChanged$, dragging$, cursor$} = this.props
        const imageOutput = this.imageOutput()
        const layer = this.maybeCreateLayer(imageOutput)
        const props = {
            currentRecipe,
            recipe,
            source,
            layer,
            layerConfig,
            imageOutput,
            map,
            boundsChanged$,
            dragging$,
            cursor$
        }
        return (
            <LayerSourceStatus status={this.sourceStatus(imageOutput)}>
                {React.createElement(getRecipeImageLayer(recipe.type), props)}
            </LayerSourceStatus>
        )
    }

    sourceStatus(imageOutput) {
        const {assetEvidence, heldSource} = this.props
        return {
            ...sourceStatus({output: imageOutput, assetEvidence}),
            heldSource,
            refresh: this.refresh,
            refreshing: this.state.refreshing
        }
    }

    componentDidMount() {
        this.mounted = true
        this.update()
    }

    componentDidUpdate() {
        this.update()
    }

    componentWillUnmount() {
        this.mounted = false
        this.watch.stop()
    }

    // An explicit refresh of the question this layer shows, shared with every other consumer of it.
    refresh() {
        const {recipe, layerConfig, sourceRuntime} = this.props
        this.setState({refreshing: true})
        sourceRuntime.refreshOutput({recipeId: recipe.id, product: layerProduct(recipe, layerConfig)})
            .catch(error => Notifications.error({message: msg('map.layerSource.refresh.failed'), error}))
            .finally(() => this.mounted && this.setState({refreshing: false}))
    }

    update() {
        const {recipe, layerConfig} = this.props
        if (!recipe) {
            return this.watch.stop()
        }
        this.watch.update({recipeId: recipe.id, product: layerProduct(recipe, layerConfig)})
        this.reconcileVisualization()
    }

    imageOutput() {
        const {recipe, layerConfig, dependencyGraph, recordStaleness, assetEvidence, sourceRuntime} = this.props
        return readRecipeOutput({
            recipe,
            product: layerProduct(recipe, layerConfig),
            graph: dependencyGraph,
            heldFor: key => sourceRuntime.heldFor(key),
            currency: recordStaleness,
            assetEvidence
        })
    }

    // Reconcile the saved selection with the current candidates (layerSelection). It reads current props, so mount and
    // update ask the same question - a restored selection can already be invalid on the first render, and that is the
    // same invalidity a later band change produces.
    reconcileVisualization(imageOutput = this.imageOutput()) {
        const {recipe, layerConfig} = this.props
        if (!recipe || this.selfManagedVisualizations()) {
            return
        }
        const visParams = layerConfig && layerConfig.visParams
        const visualizations = this.toAllVis(imageOutput)
        // Nothing is drawn for a selection no candidate matches, so nothing is held: MapAreaLayout has already been
        // given null and taken the layer off the map, which cancels it for good through its replaying cancel subject.
        // Keeping the reference would let createLayer hand that cancelled instance back whenever watchedProps happen
        // to match - and watchedProps do not see the styles that make a selection valid.
        if (selectionState({visualizations, visParams}) !== MATCHED && !this.preserved(imageOutput)) {
            this.layer = null
        }
        const selection = layerSelection({recipe, imageOutput, visualizations, visParams})
        if (selection) {
            this.selectVisualization(selection)
        }
    }

    selfManagedVisualizations() {
        const {recipe} = this.props
        return recipe && SELF_MANAGED_VISUALIZATIONS.includes(recipe.type)
    }

    toAllVis({availableBands}) {
        const {currentRecipe, recipe, sourceId} = this.props
        return layerVisualizations({
            currentRecipe,
            recipe,
            sourceId,
            presets: getRecipeType(recipe.type)?.getPreSetVisualizations(recipe) || [],
            availableBands
        })
    }

    // Only a selection that matches a current candidate gets a layer. MapAreaLayout mounts whatever is returned
    // from its OWN componentDidUpdate, and React runs a descendant's before an ancestor's, so a layer handed back
    // here reaches the map before this component can say anything more about it - and a preview for bands that
    // are gone is one Earth Engine rejects. Returning null takes the image off the map, and with it the Palette,
    // Legend or Values that described it.
    //
    // Nothing is drawn but a description over dependencies known to be sound, whoever manages the selection: a
    // preview executes every dependency, read or not, and one Earth Engine would reject - bands that do not exist,
    // a dependency that is gone - is withheld rather than requested. While the answer is being loaded nothing new is
    // drawn, but a drawing already shown is kept as long as nothing it was drawn from has changed (preserved). The same
    // holds while a source the product requires is not known to suit it (requestGate, sourceRequirements.js), and a
    // source found unsuitable takes the drawing away. The saved selection is left alone - only what it would present is
    // withheld.
    //
    // Whatever is withheld is also let go. MapAreaLayout takes a withheld layer off the map, which cancels it for
    // good, and the same watched props once the answer returns must build a new one rather than hand that one back.
    maybeCreateLayer(imageOutput = this.imageOutput()) {
        const layer = this.drawableLayer(imageOutput)
        if (!layer) {
            this.layer = null
        }
        return layer
    }

    drawableLayer(imageOutput) {
        const {layerConfig, map, recipe} = this.props
        if (!map || !recipe.ui.initialized || !layerConfig || !layerConfig.visParams) {
            return null
        }
        if (!canPreview(imageOutput)) {
            return this.preserved(imageOutput)
        }
        const {sourceGate} = this.props
        if (sourceGate) {
            return sourceGate.withdraw ? null : this.drawn(imageOutput)
        }
        if (this.selfManagedVisualizations()) {
            return this.createLayer(imageOutput)
        }
        return selectionState({visualizations: this.toAllVis(imageOutput), visParams: layerConfig.visParams}) === MATCHED
            ? this.createLayer(imageOutput)
            : null
    }

    // The drawing shown, kept while its answer is loaded again or could not be had for now, if nothing it was drawn from
    // has changed: a reload, replaced credentials or a failed check is no reason to change what is shown - credentials
    // change how later requests authenticate, not the pixels already shown. What it may authorize is the read's to say,
    // not the drawing's.
    preserved(imageOutput) {
        return isTransient(imageOutput) ? this.drawn(imageOutput) : null
    }

    // The drawing shown, if it was drawn from what would be drawn now.
    drawn(imageOutput) {
        return this.layer && sameDrawing(this.layer.watchedProps, this.drawingOf(imageOutput))
            ? this.layer
            : null
    }

    // What a drawing is drawn from: the content of every record it computes, how it is visualized, and what its pixels
    // were read from beyond them (pixelGeneration.js).
    drawingOf(imageOutput) {
        const {recipe, dependencyGraph, layerConfig, assetEvidence, sourceRefreshes} = this.props
        return {
            recipes: dependencyGraph.recipes.map(recipeContent),
            layerConfig,
            pixels: pixelGeneration({recipeId: recipe.id, assets: imageOutput.assets, assetEvidence, sourceRefreshes})
        }
    }

    createLayer(imageOutput) {
        const {recipe, layerConfig, map, boundsChanged$, dragging$, cursor$, tab: {busy}} = this.props
        const previewRequest = {
            recipe: _.omit(recipe, ['ui', 'layers']),
            ...productArgs(recipe, layerConfig),
            visParams: layerConfig.visParams
        }
        // The graph already starts with the root, so it is the complete watched list. The preview depends on
        // what every record computes and on how it is visualized; what is loaded about the output depends on
        // the first alone, so restyling rebuilds the preview and loads nothing.
        const watchedProps = this.drawingOf(imageOutput)
        if (!this.layer || !sameDrawing(this.layer.watchedProps, watchedProps)) {
            this.layer = new EarthEngineImageLayer({
                previewRequest,
                watchedProps,
                dataTypes: displayTypes(imageOutput),
                visParams: layerConfig.visParams,
                map,
                busy,
                cursorValue$: this.cursorValue$,
                boundsChanged$,
                dragging$,
                cursor$,
                onError: error => this.props.sourceRuntime.reportFailure({error, assets: imageOutput.assets})
            })
        }
        return this.layer
    }

    selectVisualization(visParams) {
        const {layerConfig, mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({...layerConfig, visParams})
    }
}

export const RecipeImageLayer = compose(
    _RecipeImageLayer,
    connect(mapStateToProps),
    withSourceRuntime(),
    withMapArea(),
    withTab(),
    withSubscriptions()
)

RecipeImageLayer.propTypes = {
    layerConfig: PropTypes.object.isRequired,
    source: PropTypes.object.isRequired,
    boundsChanged$: PropTypes.any,
    cursor$: PropTypes.any,
    dragging$: PropTypes.any,
    map: PropTypes.object
}

// An answer being loaded again - its validity included - or one that could not be had for now: not one found invalid,
// over unsound dependencies, or over an asset found missing.
const isTransient = ({status, diagnostics = [], dependencyValidity}) =>
    status === NEEDS_EVIDENCE
    || (status === READY && !dependencyValidity)
    || (status === UNAVAILABLE && dependencyValidity?.status !== INVALID
        && !diagnostics.some(({code}) => code === ASSET_UNAVAILABLE))

const sameDrawing = (drawn, current) =>
    _.isEqual(drawn.recipes, current.recipes)
    && _.isEqual(drawn.layerConfig, current.layerConfig)
    && samePixels(drawn.pixels, current.pixels)
