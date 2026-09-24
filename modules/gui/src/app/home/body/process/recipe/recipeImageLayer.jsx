import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject} from 'rxjs'

import {CursorValueContext} from '~/app/home/map/cursorValue'
import {EarthEngineImageLayer} from '~/app/home/map/layer/earthEngineImageLayer'
import {withMapArea} from '~/app/home/map/mapAreaContext'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {withSubscriptions} from '~/subscription'
import {withTab} from '~/widget/tabs/tabContext'

import {getRecipeImageLayer} from '../recipeImageLayerRegistry'
import {withSourceRuntime} from '../sourceRuntime/sourceRuntimeContext'
import {buildMapDependencyGraph} from './mapDependencyGraph'
import {OutputAcquisition} from './outputAcquisition'
import {recipeContent} from './recipeContent'
import {canPreview, displayTypes, layerProduct, productArgs, readRecipeOutput} from './recipeOutput'
import {findVisualization, MATCHED, renderableVisualizations, selectionState, UNSELECTED} from './visualizationMatching'
import {getUserDefinedVisualizations, recipeVisualizations} from './visualizations'

// The graph is derived HERE rather than in the component, because an edit to a watched dependency has to
// change these props for the layer to hear about it at all. Reading `process.loadedRecipes` whole is what
// makes that possible; returning the derived graph rather than the object is what keeps an unrelated recipe
// edit from propagating - connect's deep comparison sees identical props and suppresses the update.
//
// A selector runs on every dispatched action, not only on recipe edits, so the adapter caches the graph by the
// identity of `loadedRecipes` and of the root recipe. Unrelated actions reuse it; any recipe edit produces new
// objects and recomputes.
const mapStateToProps = (state, {source: {id, sourceConfig: {recipeId}}}) => {
    const recipe = selectFrom(state, ['process.loadedRecipes', recipeId])
    const loadedRecipes = selectFrom(state, 'process.loadedRecipes')
    return {
        sourceId: id,
        recipe,
        dependencyGraph: recipe
            ? buildMapDependencyGraph({recipe, loadedRecipes})
            : null
    }
}

// Recipe types whose own image layer form reconciles layerConfig.visParams
// (selecting a valid visualization when the available bands change). The
// generic reconciliation below has to stand down for those, or the two writers
// overwrite each other on every render and React aborts the update loop.
export const SELF_MANAGED_VISUALIZATIONS = ['BAYTS_ALERTS', 'CHANGE_ALERTS', 'LANDTRENDR']

// What the layer shows is read, not looked up: the product its config names, answered from the records the session
// holds, and - where that is not enough - from what this layer acquired and retains while it is mounted
// (recipeOutput.js, outputAcquisition.js). Its form, its selector and its visualization editor are given that
// read, so nothing below asks a second authority which bands exist.
class _RecipeImageLayer extends React.Component {
    cursorValue$ = new Subject()
    mounted = false
    acquisition = new OutputAcquisition({
        sourceRuntime: this.props.sourceRuntime,
        currentGraph: () => this.props.dependencyGraph,
        onChange: () => this.mounted && this.forceUpdate()
    })

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
        return React.createElement(getRecipeImageLayer(recipe.type), props)
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
        this.acquisition.stop()
    }

    update() {
        const {recipe} = this.props
        if (!recipe) {
            return this.acquisition.stop()
        }
        const imageOutput = this.imageOutput()
        this.acquisition.update(imageOutput.acquisition, recipe)
        this.reconcileVisualization(imageOutput)
    }

    imageOutput() {
        const {recipe, layerConfig, dependencyGraph} = this.props
        return readRecipeOutput({
            recipe,
            product: layerProduct(recipe, layerConfig),
            graph: dependencyGraph,
            heldFor: key => this.acquisition.heldFor(key)
        })
    }

    // Reconcile the saved selection with the current candidates. It reads current props, so mount and update ask
    // the same question - a restored selection can already be invalid on the first render, and that is the same
    // invalidity a later band change produces.
    //
    // An unavailable selection is never replaced. It is the user's saved intent; that its bands are missing is a
    // fact about the source right now, and writing the second over the first destroys a choice the next source
    // change would have restored. An absent selection is filled in, while a matching candidate may refresh the
    // saved definition. What an unavailable selection would present is suppressed where it is rendered.
    reconcileVisualization(imageOutput = this.imageOutput()) {
        const {recipe, layerConfig} = this.props
        if (!recipe || this.selfManagedVisualizations()) {
            return
        }
        const visParams = layerConfig && layerConfig.visParams
        const visualizations = this.toAllVis(imageOutput)
        switch (selectionState({visualizations, visParams})) {
            case UNSELECTED:
                this.selectVisualization(visualizations[0])
                break
            case MATCHED: {
                // Matching is by id, so an edited visualization still matches the selection naming it. Rewriting
                // the selection is how that edit reaches the preview.
                const matched = findVisualization(visualizations, visParams)
                if (!_.isEqual(matched, visParams)) {
                    this.selectVisualization(matched)
                }
                break
            }
            // NO_CANDIDATES and STALE. Nothing is drawn, so nothing is held: MapAreaLayout has already been given
            // null and taken the layer off the map, which cancels it for good through its replaying cancel
            // subject. Keeping the reference would let createLayer hand that cancelled instance back whenever
            // watchedProps happen to match - and watchedProps do not see the styles that make a selection valid.
            default:
                this.layer = null
        }
    }

    selfManagedVisualizations() {
        const {recipe} = this.props
        return recipe && SELF_MANAGED_VISUALIZATIONS.includes(recipe.type)
    }

    toAllVis({availableBands}) {
        const {currentRecipe, recipe, sourceId} = this.props
        // Source-scoped user styles are held to the same rule the presets are: the bands they name must
        // exist, and must be ones a renderer can draw.
        return [
            ...renderableVisualizations(getUserDefinedVisualizations(currentRecipe, sourceId), availableBands),
            ...recipeVisualizations(recipe, availableBands),
        ]
    }

    // Only a selection that matches a current candidate gets a layer. MapAreaLayout mounts whatever is returned
    // from its OWN componentDidUpdate, and React runs a descendant's before an ancestor's, so a layer handed back
    // here reaches the map before this component can say anything more about it - and a preview for bands that
    // are gone is one Earth Engine rejects. Returning null takes the image off the map, and with it the Palette,
    // Legend or Values that described it.
    //
    // Nothing is drawn but a description over dependencies known to be sound, whoever manages the selection: a
    // preview executes every dependency, read or not, and one Earth Engine would reject - bands that do not exist,
    // a dependency that is gone - is withheld rather than requested. While the answer is being acquired it is
    // withheld too. The saved selection is left alone - only what it would present is withheld.
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
            return null
        }
        if (this.selfManagedVisualizations()) {
            return this.createLayer(imageOutput)
        }
        return selectionState({visualizations: this.toAllVis(imageOutput), visParams: layerConfig.visParams}) === MATCHED
            ? this.createLayer(imageOutput)
            : null
    }

    createLayer(imageOutput) {
        const {recipe, dependencyGraph, layerConfig, map, boundsChanged$, dragging$, cursor$, tab: {busy}} = this.props
        const {watchedProps: prevWatchedProps} = this.layer || {}
        const previewRequest = {
            recipe: _.omit(recipe, ['ui', 'layers']),
            ...productArgs(recipe, layerConfig),
            visParams: layerConfig.visParams
        }
        // The graph already starts with the root, so it is the complete watched list. The preview depends on
        // what every record computes and on how it is visualized; what is acquired about the output depends on
        // the first alone, so restyling rebuilds the preview and acquires nothing.
        const watchedProps = {
            recipes: dependencyGraph.recipes.map(recipeContent),
            layerConfig
        }
        if (!_.isEqual(watchedProps, prevWatchedProps)) {
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
                cursor$
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
