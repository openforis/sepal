import _ from 'lodash'
import {Observable} from 'rxjs'
import {beforeEach, describe, expect, it, vi} from 'vitest'

import {buildRecipeDependencyGraph} from '#sepal/recipe/source/dependencyGraph'
import {radarMosaicBands} from '#sepal/recipe/type/radarMosaic'

// Narrow smoke tests for the render-time guard and the visualization reconciler. The durable rules - matching,
// applicability and which selection to write - are pure and tested in visualizationMatching.test.js; what is checked
// here is only that the component asks them at the right moment and acts on the answer. The stale cases select a style
// the band-name filter removes, so they also cover that the component applies that filter rather than merely importing
// it.
//
// `compose` is mocked to the identity so the exported component is the class itself. Nothing renders: the
// lifecycle methods are called on an instance whose props are supplied, which is the state React would have
// given it. Reconciliation reads current props, so mount and update differ only in which method is called - and
// each is exercised, because wiring one without the other is exactly the defect these guard against.
//
// Returning a layer does not itself request a preview. It is what allows the surrounding lifecycle - MapAreaLayout
// mounting it via SepalMap.setLayer - to request one, and that lifecycle runs before this component can reconcile.

const state = vi.hoisted(() => ({constructed: []}))

// Identity `compose` makes the exported component the class itself; `composeHoC` is what `connect` builds on and
// must exist for the module to load, though the HOC it returns is never applied.
vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/app/home/map/layer/earthEngineImageLayer', () => ({
    EarthEngineImageLayer: class {
        constructor(args) {
            state.constructed.push(args)
            this.watchedProps = args.watchedProps
        }
        removeFromMap() {}
    }
}))

vi.mock('~/translate', () => ({msg: key => key}))

const availableBandsByType = vi.hoisted(() => ({}))

// What the declared types this suite shows register beside their declarations: Optical Mosaic's presentation,
// CCDC's, LandTrendr's, Change Alerts' and BAYTS Alerts' own map products, and Radar Mosaic's presentation and presets.
vi.mock('~/app/home/body/process/recipeTypeRegistry', async () => {
    const {mapProducts} = await import('./ccdc/bands')
    const landTrendr = await import('./landTrendr/bands')
    const changeAlerts = await import('./changeAlerts/bands')
    const baytsAlerts = await import('./baytsAlerts/bands')
    const radarMosaic = await import('./radarMosaic/bands')
    const {getPreSetVisualizations} = await import('./radarMosaic/visualizations')
    const registeredByType = {
        MOSAIC: {bandPresentation: () => ({blue: {dataType: {precision: 'int'}}})},
        CCDC: {mapProducts},
        LANDTRENDR: {mapProducts: landTrendr.mapProducts, bandPresentation: landTrendr.bandPresentation},
        CHANGE_ALERTS: {mapProducts: changeAlerts.mapProducts, bandPresentation: changeAlerts.bandPresentation},
        BAYTS_ALERTS: {mapProducts: baytsAlerts.mapProducts, bandPresentation: baytsAlerts.bandPresentation},
        RADAR_MOSAIC: {bandPresentation: radarMosaic.bandPresentation, getPreSetVisualizations}
    }
    return {
        getRecipeType: type => ({
            getAvailableBands: () => availableBandsByType[type],
            getPreSetVisualizations: () => [],
            ...registeredByType[type]
        })
    }
})

const {RecipeImageLayer} = await import('./recipeImageLayer')
const {recipeContent} = await import('./recipeContent')
const {productArgs} = await import('./recipeOutput')
const {visualizations: radarPresets} = await import('./radarMosaic/visualizations')

beforeEach(() => {
    state.constructed = []
    availableBandsByType.SYNTHETIC = {ndvi: {}, evi: {}}
})

const recipeOf = ({type = 'SYNTHETIC', userDefined = []} = {}) => ({
    id: 'recipe-1',
    type,
    ui: {initialized: true},
    layers: {userDefinedVisualizations: {'this-recipe': userDefined}},
    model: {}
})

// `undefined` means the layer config carries no selection at all; `null` means the reconciler has already
// cleared one. The two are different questions to ask the reconciler, so the builder keeps them apart.
const build = ({recipe, visParams, previousLayer, mode = {}}) => {
    const updates = []
    const instance = new RecipeImageLayer({
        currentRecipe: recipe,
        recipe,
        sourceId: 'this-recipe',
        source: {id: 'this-recipe'},
        layerConfig: visParams === undefined ? mode : {...mode, visParams},
        dependencyGraph: {recipes: [recipe], edges: [], diagnostics: []},
        map: {},
        mapArea: {updateLayerConfig: layerConfig => updates.push(layerConfig)},
        tab: {busy: {set: () => {}}},
        boundsChanged$: null,
        dragging$: null,
        cursor$: null
    })
    instance.layer = previousLayer
    // React hands componentDidUpdate the previous props; the reconciler reads the current ones. Passing the same
    // props back is the realistic case - available bands changed while the layer config did not.
    const didUpdate = () => instance.componentDidUpdate(instance.props)
    // React replaces props before it calls the lifecycle; without a renderer this is the equivalent. The
    // dependency graph is derived from the same records, so it moves with them as the selector's does.
    const setRecipe = recipe => instance.props = {
        ...instance.props,
        recipe,
        currentRecipe: recipe,
        dependencyGraph: {recipes: [recipe], edges: [], diagnostics: []}
    }
    const setLayerConfig = layerConfig => instance.props = {...instance.props, layerConfig}
    return {instance, updates, didUpdate, setRecipe, setLayerConfig}
}

const selections = updates => updates.map(({visParams}) => visParams)

const styles = userDefined => recipeOf({userDefined})

const VALID = {id: 'valid', bands: ['ndvi']}
const ALTERNATIVE = {id: 'alternative', bands: ['evi']}
const STALE_SELECTION = {id: 'stale', bands: ['gone']}

describe('the render-time guard', () => {
    it('withholds any layer for a stale selection, the one already on screen included', () => {
        const {instance} = build({
            recipe: styles([VALID, STALE_SELECTION]),
            visParams: STALE_SELECTION,
            previousLayer: {existing: true, removeFromMap: () => {}}
        })

        expect(instance.maybeCreateLayer()).toBe(null)
        expect(state.constructed).toEqual([])
    })

    it('returns a layer normally for a selection that is still available', () => {
        const {instance} = build({
            recipe: styles([{id: 'v1', bands: ['ndvi']}]),
            visParams: {id: 'v1', bands: ['ndvi']}
        })

        expect(instance.maybeCreateLayer()).not.toBe(null)
        expect(state.constructed).toHaveLength(1)
        expect(state.constructed[0].visParams).toEqual({id: 'v1', bands: ['ndvi']})
    })

    it('leaves removal of a replaced layer to MapAreaLayout', () => {
        const removed = []
        const {instance} = build({
            recipe: styles([VALID]),
            visParams: VALID,
            previousLayer: {
                watchedProps: {different: true},
                removeFromMap: () => removed.push('removed')
            }
        })

        expect(instance.maybeCreateLayer()).not.toBe(null)
        expect(state.constructed).toHaveLength(1)
        expect(removed).toEqual([])
    })

    it('drops the layer when nothing is available, without building one', () => {
        const {instance} = build({
            recipe: styles([]),
            visParams: {id: 'v1', bands: ['ndvi']},
            previousLayer: {existing: true, removeFromMap: () => {}}
        })

        expect(instance.maybeCreateLayer()).toBe(null)
        expect(state.constructed).toEqual([])
    })

    // The guard must stand down wherever generic reconciliation does, or it would withhold a layer that nothing
    // is going to reconcile.
    it('stands down for a self-managed recipe type', () => {
        const {instance} = build({
            recipe: recipeOf({type: 'CHANGE_ALERTS', userDefined: [{id: 'v1', bands: ['ndvi']}]}),
            visParams: {id: 'gone', bands: ['gone']}
        })

        expect(instance.maybeCreateLayer()).not.toBe(null)
        expect(state.constructed).toHaveLength(1)
    })

    // CCDC Slice renders its own layer form but no longer reconciles or gates its own selection, so the
    // guard has to hold for it like any other type. Exempting it drew a preview for bands its source had
    // stopped producing.
    it('holds for a slice whose selected bands are gone', () => {
        availableBandsByType.CCDC_SLICE = {nbr: {}}
        const {instance} = build({
            recipe: recipeOf({type: 'CCDC_SLICE', userDefined: [{id: 'v-nbr', bands: ['nbr']}]}),
            visParams: {id: 'v-ndvi', bands: ['ndvi']}
        })

        expect(instance.maybeCreateLayer()).toBe(null)
        expect(state.constructed).toEqual([])
    })

    // A recipe whose source could not be resolved reports no bands. Nothing it could draw exists, and a
    // preview of bands that do not exist is one Earth Engine rejects - so the guard applies whether or not
    // the type manages its own selection.
    describe('a recipe with no bands at all', () => {
        beforeEach(() => {
            availableBandsByType.SYNTHETIC = {}
        })

        it('gets no layer', () => {
            const {instance} = build({
                recipe: styles([VALID]),
                visParams: VALID,
                previousLayer: {existing: true, removeFromMap: () => {}}
            })

            expect(instance.maybeCreateLayer()).toBe(null)
            expect(state.constructed).toEqual([])
        })

        // A Change Alerts mosaic mode has no mosaic before the recipe states a period to build it around.
        it('gets no layer even when it manages its own visualizations', () => {
            const {instance} = build({
                recipe: recipeOf({type: 'CHANGE_ALERTS', userDefined: [{id: 'v1', bands: ['ndvi']}]}),
                mode: {visualizationType: 'monitoring', mosaicType: 'latest'},
                visParams: {id: 'v1', bands: ['ndvi']}
            })

            expect(instance.maybeCreateLayer()).toBe(null)
        })

        it('keeps the saved selection, which the source may make valid again', () => {
            const {instance, updates} = build({recipe: styles([VALID]), visParams: VALID})

            instance.componentDidMount()

            expect(updates).toEqual([])
        })
    })
})

// A layer is built from what the recipe describes AND from the runtime evidence behind it. Reading a source
// again can produce the same schema over different pixels, so the layer must be replaced rather than kept.
describe('runtime evidence behind a layer', () => {
    const observed = observation => ({
        ...recipeOf({userDefined: [VALID]}),
        ui: {initialized: true, sourceEvidence: {sourceKey: 'RECIPE_REF:source-1', observation}}
    })

    it('replaces the layer when the source has been read again', () => {
        const {instance, setRecipe} = build({recipe: observed(1), visParams: VALID})
        const first = instance.maybeCreateLayer()

        setRecipe(observed(2))
        const second = instance.maybeCreateLayer()

        expect(second).not.toBe(first)
        expect(state.constructed).toHaveLength(2)
    })

    it('keeps the layer while nothing has been read again', () => {
        const {instance, setRecipe} = build({recipe: observed(1), visParams: VALID})
        const first = instance.maybeCreateLayer()

        setRecipe(observed(1))

        expect(instance.maybeCreateLayer()).toBe(first)
        expect(state.constructed).toHaveLength(1)
    })
})

// A preview is rebuilt for what it was computed from, and for nothing else. The map's own layout lives
// inside the recipe, so configuring an area that shows something else saves the recipe - and the server
// answers with a revision, which is a fact about the save rather than about the image.
describe('what the preview is rebuilt for', () => {
    const withOtherArea = ({visParams, revision}) => {
        const recipe = styles([VALID, ALTERNATIVE])
        return {
            ...recipe,
            revision,
            layers: {...recipe.layers, areas: {'center-right': {imageLayer: {layerConfig: {visParams}}}}}
        }
    }

    it('keeps it when another area is restyled and the save is acknowledged', () => {
        const {instance, setRecipe} = build({
            recipe: withOtherArea({visParams: {id: 'asset-grey'}, revision: 7}),
            visParams: VALID
        })
        const first = instance.maybeCreateLayer()

        setRecipe(withOtherArea({visParams: {id: 'asset-colour'}, revision: 7}))
        const afterRestyle = instance.maybeCreateLayer()
        setRecipe(withOtherArea({visParams: {id: 'asset-colour'}, revision: 8}))
        const afterAcknowledgement = instance.maybeCreateLayer()

        expect(afterRestyle).toBe(first)
        expect(afterAcknowledgement).toBe(first)
        expect(state.constructed).toHaveLength(1)
    })

    // Same bands, different pixels: what the preview shows changed even though nothing about its shape did.
    it('rebuilds it after a computation change that produces the same bands', () => {
        const {instance, setRecipe} = build({recipe: styles([VALID]), visParams: VALID})
        const first = instance.maybeCreateLayer()

        setRecipe({...styles([VALID]), model: {threshold: 0.5}})

        expect(instance.maybeCreateLayer()).not.toBe(first)
        expect(state.constructed).toHaveLength(2)
    })

    it('rebuilds it when the displayed visualization changes', () => {
        const {instance, setLayerConfig} = build({recipe: styles([VALID, ALTERNATIVE]), visParams: VALID})
        const first = instance.maybeCreateLayer()

        setLayerConfig({visParams: ALTERNATIVE})

        expect(instance.maybeCreateLayer()).not.toBe(first)
        expect(state.constructed).toHaveLength(2)
    })

    it('rebuilds it when the recipe is retiled', () => {
        const {instance, setRecipe} = build({recipe: styles([VALID]), visParams: VALID})
        const first = instance.maybeCreateLayer()

        setRecipe({...styles([VALID]), retile: 64})

        expect(instance.maybeCreateLayer()).not.toBe(first)
        expect(state.constructed).toHaveLength(2)
    })
})

describe('visualization reconciliation', () => {
    // Having no candidate is a fact about the source right now; the selection is the user's saved intent. Writing
    // the first over the second destroys something a source change would have restored, so nothing is written
    // here at all. Suppressing what the selection would otherwise present is the renderer's job, not the store's.
    describe('when no visualization is available', () => {
        it('leaves the selection alone on mount', () => {
            const {instance, updates} = build({recipe: styles([]), visParams: VALID})

            instance.componentDidMount()

            expect(updates).toEqual([])
        })

        it('leaves the selection alone on update', () => {
            const {updates, didUpdate} = build({recipe: styles([]), visParams: VALID})

            didUpdate()

            expect(updates).toEqual([])
        })

        // The old mount path dispatched `visualizations[0]` whenever no selection was set, which with no
        // candidates wrote an undefined selection into the layer config.
        it('does not write an undefined selection when nothing has ever been selected', () => {
            const {instance, updates} = build({recipe: styles([])})

            instance.componentDidMount()

            expect(updates).toEqual([])
        })

        it('keeps the saved selection through an empty period and reuses it when candidates return', () => {
            const {instance, updates, didUpdate, setRecipe} = build({recipe: styles([]), visParams: VALID})

            instance.componentDidMount()
            didUpdate()
            setRecipe(styles([VALID]))
            didUpdate()

            expect(updates).toEqual([])
            expect(instance.maybeCreateLayer()).not.toBe(null)
            expect(state.constructed[0].visParams).toBe(VALID)
        })

        it('keeps the saved selection through an empty period and replaces it when other candidates return', () => {
            const {instance, updates, didUpdate, setRecipe} = build({recipe: styles([]), visParams: STALE_SELECTION})

            instance.componentDidMount()
            didUpdate()
            setRecipe(styles([VALID, ALTERNATIVE]))
            didUpdate()

            expect(selections(updates)).toEqual([VALID])
        })

        // SepalMap owns removal. The rendered null reaches MapAreaLayout first, which calls removeLayer and
        // cancels the instance through its replaying cancel subject. Removing it here as well would make two
        // owners, and keeping the reference would hand that cancelled instance back the next time watchedProps
        // happen to match - a layer that can never add itself to a map again.
        it('relinquishes its layer instead of removing it itself', () => {
            const removed = []
            const {instance, didUpdate} = build({
                recipe: styles([]),
                visParams: VALID,
                previousLayer: {removeFromMap: () => removed.push('removed')}
            })

            didUpdate()

            expect(instance.layer).toBe(null)
            expect(removed).toEqual([])
        })

        it('builds a fresh layer when the candidates return, never the cancelled one', () => {
            const {instance, updates, didUpdate} = build({recipe: styles([VALID]), visParams: VALID})
            const first = instance.maybeCreateLayer()

            // Only the available bands change: same recipe, same layer config, so watchedProps are identical
            // and a retained instance would be handed straight back.
            availableBandsByType.SYNTHETIC = {}
            didUpdate()
            expect(instance.layer).toBe(null)
            expect(instance.maybeCreateLayer()).toBe(null)

            availableBandsByType.SYNTHETIC = {ndvi: {}, evi: {}}
            didUpdate()

            expect(instance.maybeCreateLayer()).not.toBe(first)
            expect(state.constructed).toHaveLength(2)
            expect(updates).toEqual([])
        })
    })

    describe('when visualizations are available', () => {
        it('selects the first one after a source change brings candidates back', () => {
            const {updates, didUpdate} = build({recipe: styles([VALID]), visParams: null})

            didUpdate()

            expect(selections(updates)).toEqual([VALID])
        })

        // Matching is by id, so a restyled visualization still matches the selection that names it. The
        // selection is then rewritten to carry the new fields - that is how an edit reaches the preview.
        it('normalizes a selection whose matching candidate has been edited', () => {
            const edited = {id: 'valid', bands: ['ndvi'], palette: ['#000000']}
            const {updates, didUpdate} = build({recipe: styles([edited]), visParams: VALID})

            didUpdate()

            expect(selections(updates)).toEqual([edited])
        })
    })

    it('leaves a self-managed recipe type to make its own first selection', () => {
        const {instance, updates, didUpdate} = build({
            recipe: recipeOf({type: 'CHANGE_ALERTS', userDefined: [{id: 'v1', bands: ['ndvi']}]})
        })

        instance.componentDidMount()
        didUpdate()

        expect(updates).toEqual([])
    })
})

// Which visualization a layer shows, over a Radar Mosaic's real presentation and presets. The first candidate is the
// picker's first: the recipe's own styles, then its presets in the order its form offers them.
describe('choosing a visualization', () => {
    const POINT_IN_TIME_FIRST = ['VV', 'VH', 'ratio_VV_VH']
    const TIME_SCAN_FIRST = ['VV_max', 'VH_min', 'NDCV']
    const [TIME_SCAN_STYLE] = radarPresets.TIME_SCAN
    const DAY_OF_YEAR_STYLE = radarPresets.METADATA[0]
    const VV_STYLE = {id: 'vv-style', bands: ['VV'], type: 'continuous'}

    // A new recipe opens on a period, and the dates panel may replace it with a target date before setup completes.
    it('writes nothing while the recipe is being set up', () => {
        const {instance, updates, rerender} = shown({recipe: radarMosaic({dates: PERIOD, initialized: false})})

        rerender()

        expect(updates).toEqual([])
        expect(instance.maybeCreateLayer()).toBe(null)
    })

    it.each([
        ['a target date', TARGET_DATE, POINT_IN_TIME_FIRST],
        ['a period', PERIOD, TIME_SCAN_FIRST]
    ])('selects the first visualization once setup completes on %s', (_name, dates, first) => {
        const {instance, updates, setRecipe} = shown({recipe: radarMosaic({dates: PERIOD, initialized: false})})

        setRecipe(radarMosaic({dates}))

        expect(selections(updates).map(({bands}) => bands)).toEqual([first])
        expect(instance.maybeCreateLayer()).not.toBe(null)
        expect(state.constructed[0].visParams.bands).toEqual(first)
    })

    it('replaces a restored selection the output no longer offers with the first candidate', () => {
        const {instance, updates} = shown({recipe: radarMosaic(), visParams: TIME_SCAN_STYLE})

        expect(selections(updates).map(({bands}) => bands)).toEqual([POINT_IN_TIME_FIRST])
        expect(instance.maybeCreateLayer()).not.toBe(null)
        expect(state.constructed[0].visParams.bands).toEqual(POINT_IN_TIME_FIRST)
    })

    it('replaces a selection the output stops offering once the recipe is initialized', () => {
        const {instance, updates, setRecipe} = shown({recipe: radarMosaic({dates: PERIOD}), visParams: TIME_SCAN_STYLE})

        setRecipe(radarMosaic({dates: TARGET_DATE}))

        expect(selections(updates).map(({bands}) => bands)).toEqual([POINT_IN_TIME_FIRST])
        expect(instance.maybeCreateLayer()).not.toBe(null)
        expect(state.constructed[0].visParams.bands).toEqual(POINT_IN_TIME_FIRST)
    })

    it.each([
        ['a preset other than the first', [], DAY_OF_YEAR_STYLE],
        ['a user-defined style', [VV_STYLE], VV_STYLE]
    ])('keeps %s that the output still offers', (_name, userDefined, selected) => {
        const {instance, updates, rerender} = shown({recipe: radarMosaic({styles: userDefined}), visParams: selected})

        rerender()

        expect(updates).toEqual([])
        expect(instance.maybeCreateLayer()).not.toBe(null)
        expect(state.constructed[0].visParams).toEqual(selected)
    })

    describe('a Radar Mosaic whose area of interest the session does not hold', () => {
        const unheld = () => shown({
            recipe: radarMosaic({aoi: {type: 'RECIPE', id: 'aoi-1'}}),
            visParams: TIME_SCAN_STYLE
        })

        it('keeps its selection while its output is described, then reconciles it against the answer', () => {
            const {instance, runtime, settle, updates, rerender} = unheld()
            rerender()
            expect(updates).toEqual([])

            settle(runtime.operations[0], described(instance.props.recipe))
            rerender()

            expect(selections(updates).map(({bands}) => bands)).toEqual([POINT_IN_TIME_FIRST])
        })

        it('keeps its selection when its output cannot be described, and reconciles it once described again', () => {
            const {instance, runtime, settle, updates, rerender} = unheld()

            settle(runtime.operations[0], unreadable(instance.props.recipe))
            rerender()
            expect(updates).toEqual([])
            expect(instance.maybeCreateLayer()).toBe(null)

            runtime.changeCredentials()
            settle(runtime.operations[1], described(instance.props.recipe))
            rerender()

            expect(selections(updates).map(({bands}) => bands)).toEqual([POINT_IN_TIME_FIRST])
        })

        it('draws nothing over invalid dependencies, though a visualization is selected', () => {
            const {instance, runtime, settle, rerender} = shown({
                recipe: radarMosaic({aoi: {type: 'RECIPE', id: 'aoi-1'}}),
                visParams: radarPresets.POINT_IN_TIME[0]
            })

            settle(runtime.operations[0], {
                ...described(instance.props.recipe),
                dependencyValidity: {status: 'INVALID', diagnostics: [{code: 'CYCLE'}]}
            })
            rerender()

            expect(instance.props.layerConfig.visParams).toBe(radarPresets.POINT_IN_TIME[0])
            expect(instance.maybeCreateLayer()).toBe(null)
        })
    })
})

// What the layer acquires about its output, and what it draws from the answer. The real graph builder, shared
// declarations and read run; the runtime's two operations and its credential epochs are driven by hand.
describe('acquiring what the layer shows', () => {
    const COUNT_STYLE = {id: 'count-style', bands: ['count'], type: 'continuous'}
    const BLUE_STYLE = {id: 'blue-style', bands: ['blue'], type: 'continuous'}

    it('draws masking over an optical mosaic the session holds at once, acquiring nothing', () => {
        const {instance, runtime} = shown({
            recipe: masking({mask: {type: 'ASSET', id: 'users/x/mask'}, styles: [BLUE_STYLE]}),
            records: [mosaic()],
            visParams: BLUE_STYLE
        })

        expect(instance.maybeCreateLayer()).not.toBe(null)
        expect(runtime.operations).toEqual([])
    })

    it('keeps the display precision the optical mosaic presents for the cursor', () => {
        const {instance} = shown({recipe: {...mosaic(), ...ownStyles([BLUE_STYLE])}, visParams: BLUE_STYLE})

        instance.maybeCreateLayer()

        expect(state.constructed[0].dataTypes.blue).toEqual({precision: 'int'})
    })

    describe('a count layer whose dependency the session does not hold', () => {
        const countLayer = () => shown({
            recipe: {...ccdc({aoi: {type: 'RECIPE', id: 'aoi-1'}}), ...ownStyles([COUNT_STYLE])},
            layerConfig: {visualizationType: 'COUNT', visParams: COUNT_STYLE}
        })

        it('only completes the dependencies, never describing the output it does not show', () => {
            const {runtime} = countLayer()

            expect(runtime.operations.map(({kind}) => kind)).toEqual(['DEPENDENCIES'])
        })

        it('is withheld until they are known to be sound, then drawn', () => {
            const {instance, runtime, settle} = countLayer()
            expect(instance.maybeCreateLayer()).toBe(null)

            settle(runtime.operations[0], completed(instance.props.recipe))

            expect(instance.maybeCreateLayer()).not.toBe(null)
        })

        it('requests its preview with the arguments naming its product, as its editor does', () => {
            const {instance, runtime, settle} = countLayer()
            settle(runtime.operations[0], completed(instance.props.recipe))

            instance.maybeCreateLayer()

            expect(state.constructed[0].previewRequest).toEqual({
                recipe: _.omit(instance.props.recipe, ['ui', 'layers']),
                ...productArgs(instance.props.recipe, instance.props.layerConfig),
                visParams: COUNT_STYLE
            })
            expect(productArgs(instance.props.recipe, instance.props.layerConfig)).toEqual({visualizationType: 'COUNT'})
        })

        it('asks for the count it offers before its form has written the mode', () => {
            const {instance, runtime, settle} = shown({
                recipe: {...ccdc({aoi: {type: 'RECIPE', id: 'aoi-1'}}), ...ownStyles([COUNT_STYLE])},
                visParams: COUNT_STYLE
            })
            settle(runtime.operations[0], completed(instance.props.recipe))

            instance.maybeCreateLayer()

            expect(state.constructed[0].previewRequest.visualizationType).toBe('COUNT')
        })

        it('is withheld, keeping its selection, when one cannot be read', () => {
            const {instance, runtime, settle, updates} = countLayer()

            settle(runtime.operations[0], unreadable(instance.props.recipe))
            instance.componentDidUpdate(instance.props)

            expect(instance.maybeCreateLayer()).toBe(null)
            expect(updates).toEqual([])
        })

        it('rebuilds the preview on a restyle without acquiring anything again', () => {
            const {instance, runtime, settle, setRecipe} = countLayer()
            settle(runtime.operations[0], completed(instance.props.recipe))
            instance.maybeCreateLayer()
            const restyled = {...COUNT_STYLE, palette: ['#000000', '#ffffff']}

            setRecipe({...instance.props.recipe, ...ownStyles([restyled])})

            expect(runtime.operations).toHaveLength(1)
            expect(instance.maybeCreateLayer()).not.toBe(null)
            expect(state.constructed).toHaveLength(2)
            expect(state.constructed[1].visParams).toEqual(restyled)
        })

        // The withheld layer was taken off the map and cancelled, so recovery must draw a new one.
        it('is withheld when credentials change after it was drawn, then drawn anew once acquired again', () => {
            const {instance, runtime, settle} = countLayer()
            settle(runtime.operations[0], completed(instance.props.recipe))
            const drawn = instance.maybeCreateLayer()

            runtime.changeCredentials()
            expect(instance.maybeCreateLayer()).toBe(null)
            expect(runtime.operations).toHaveLength(2)
            settle(runtime.operations[1], completed(instance.props.recipe))
            const redrawn = instance.maybeCreateLayer()

            expect(redrawn).not.toBe(null)
            expect(redrawn).not.toBe(drawn)
            expect(state.constructed).toHaveLength(2)
        })
    })

    // The year is the product's, not the records': another year is described again from the recipe, while what was
    // acquired about its dependencies still holds.
    describe('a LandTrendr annual mosaic whose dependency the session does not hold', () => {
        const RGB = {id: 'rgb', bands: ['red', 'green', 'blue'], type: 'rgb'}
        const annualMosaic = year => ({visualizationType: 'mosaics', year, visParams: RGB})

        it('rebuilds the preview for another year, reusing what it acquired', () => {
            const {instance, runtime, settle, setLayerConfig} = shown({
                recipe: {...landTrendr({aoi: {type: 'RECIPE', id: 'aoi-1'}}), ...ownStyles([])},
                layerConfig: annualMosaic(2018)
            })
            settle(runtime.operations[0], completed(instance.props.recipe))
            instance.maybeCreateLayer()

            setLayerConfig(annualMosaic(2019))

            expect(instance.maybeCreateLayer()).not.toBe(null)
            expect(runtime.operations.map(({kind}) => kind)).toEqual(['DEPENDENCIES'])
            expect(state.constructed.map(({previewRequest: {visualizationType, year}}) => ({visualizationType, year})))
                .toEqual([{visualizationType: 'mosaics', year: 2018}, {visualizationType: 'mosaics', year: 2019}])
        })
    })

    // The position is the product's, not the records': the other one is described again from the recipe, while what was
    // acquired about its dependencies still holds.
    describe('a BAYTS Alerts radar observation whose reference the session does not hold', () => {
        const VV = {id: 'vv', type: 'continuous', bands: ['VV'], min: [-20], max: [0]}
        const observation = (position, visParams = VV) => ({visualizationType: position, visParams})
        const shownAt = position => shown({recipe: {...baytsAlerts(), ...ownStyles([])}, layerConfig: observation(position)})

        it('only completes the dependencies, then requests its preview with the arguments its editor reads it by', () => {
            const {instance, runtime, settle} = shownAt('first')
            expect(runtime.operations.map(({kind}) => kind)).toEqual(['DEPENDENCIES'])
            expect(instance.maybeCreateLayer()).toBe(null)

            settle(runtime.operations[0], completed(instance.props.recipe))
            instance.maybeCreateLayer()

            expect(state.constructed[0].previewRequest).toEqual({
                recipe: _.omit(instance.props.recipe, ['ui', 'layers']),
                ...productArgs(instance.props.recipe, instance.props.layerConfig),
                visParams: VV
            })
            expect(productArgs(instance.props.recipe, instance.props.layerConfig))
                .toEqual({visualizationType: 'first', previouslyConfirmed: 'exclude', minConfidence: 'high'})
        })

        it('rebuilds the preview for the other position, reusing what it acquired', () => {
            const {instance, runtime, settle, setLayerConfig} = shownAt('first')
            settle(runtime.operations[0], completed(instance.props.recipe))
            instance.maybeCreateLayer()

            setLayerConfig(observation('last'))

            expect(instance.maybeCreateLayer()).not.toBe(null)
            expect(runtime.operations.map(({kind}) => kind)).toEqual(['DEPENDENCIES'])
            expect(state.constructed.map(({previewRequest: {visualizationType}}) => visualizationType)).toEqual(['first', 'last'])
            expect(_.omit(state.constructed[1].previewRequest, ['recipe', 'visParams']))
                .toEqual(productArgs(instance.props.recipe, instance.props.layerConfig))
        })

        it('rebuilds the preview on a restyle without acquiring anything again', () => {
            const {instance, runtime, settle, setLayerConfig} = shownAt('last')
            settle(runtime.operations[0], completed(instance.props.recipe))
            instance.maybeCreateLayer()
            const restyled = {...VV, max: [5]}

            setLayerConfig(observation('last', restyled))

            expect(instance.maybeCreateLayer()).not.toBe(null)
            expect(runtime.operations).toHaveLength(1)
            expect(state.constructed.map(({visParams}) => visParams)).toEqual([VV, restyled])
        })

        it('is withheld when its reference cannot be read', () => {
            const {instance, runtime, settle} = shownAt('first')

            settle(runtime.operations[0], unreadable(instance.props.recipe))

            expect(instance.maybeCreateLayer()).toBe(null)
        })
    })

    it('withholds masking whose unread mask was deleted, keeping its selection', () => {
        const {instance, runtime, settle, updates} = shown({
            recipe: masking({mask: {type: 'RECIPE_REF', id: 'deleted-mask'}, styles: [BLUE_STYLE]}),
            records: [mosaic()],
            visParams: BLUE_STYLE
        })
        expect(runtime.operations.map(({kind}) => kind)).toEqual(['DESCRIBE'])

        settle(runtime.operations[0], {...unreadable(instance.props.recipe), description: null, diagnostics: []})
        instance.componentDidUpdate(instance.props)

        expect(instance.maybeCreateLayer()).toBe(null)
        expect(updates).toEqual([])
    })
})

const ownStyles = styles => ({
    ui: {initialized: true},
    layers: {userDefinedVisualizations: {'this-recipe': styles}}
})

const mosaic = () => ({
    id: 'mosaic-1',
    type: 'MOSAIC',
    model: {
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, cloudPercentageThreshold: 100},
        compositeOptions: {corrections: ['SR'], compose: 'MEDIAN'}
    }
})

const masking = ({mask, styles}) => ({
    id: 'masked-1',
    type: 'MASKING',
    model: {imageToMask: {type: 'RECIPE_REF', id: 'mosaic-1'}, imageMask: mask},
    ...ownStyles(styles)
})

const ccdc = model => ({id: 'ccdc-1', type: 'CCDC', model})

const TARGET_DATE = {targetDate: '2024-06-01'}
const PERIOD = {fromDate: '2024-01-01', toDate: '2025-01-01'}
const DRAWN_AOI = {type: 'POLYGON', path: [[0, 0], [0, 1], [1, 1], [1, 0]]}

// On a target date over an area drawn on the map unless told otherwise, so that nothing it reads has to be loaded.
const radarMosaic = ({dates = TARGET_DATE, aoi = DRAWN_AOI, initialized = true, styles = []} = {}) => ({
    id: 'radar-1',
    type: 'RADAR_MOSAIC',
    model: {aoi, dates, options: {orbits: ['ASCENDING', 'DESCENDING']}},
    ...ownStyles(styles),
    ui: {initialized}
})

const landTrendr = ({aoi}) => ({
    id: 'landtrendr-1',
    type: 'LANDTRENDR',
    model: {
        aoi,
        dates: {startYear: 2014, endYear: 2021},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'nbr'},
        options: {corrections: ['SR']},
        landTrendrOptions: {}
    }
})

const baytsAlerts = () => ({
    id: 'bayts-alerts-1',
    type: 'BAYTS_ALERTS',
    model: {
        reference: {type: 'RECIPE_REF', id: 'bayts-historical-1'},
        date: {monitoringEnd: '2024-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months'},
        options: {orbits: ['ASCENDING', 'DESCENDING']},
        baytsAlertsOptions: {}
    }
})

const basisOf = recipe => [{id: recipe.id, content: recipeContent(recipe)}]

const completed = recipe => ({
    status: 'COMPLETE',
    error: null,
    dependencyValidity: {status: 'VALID', diagnostics: []},
    basis: basisOf(recipe)
})

// A Radar Mosaic described from its own declaration.
const described = recipe => ({
    ...completed(recipe),
    status: 'READY',
    description: {output: {kind: 'IMAGE', bands: radarMosaicBands(recipe.model)}},
    diagnostics: []
})

const unreadable = recipe => ({
    status: 'UNAVAILABLE',
    error: new Error('recipe not found'),
    dependencyValidity: {status: 'UNAVAILABLE', diagnostics: [{code: 'MISSING_SOURCE'}]},
    basis: basisOf(recipe)
})

const runtimeOf = () => {
    const operations = []
    const listeners = new Set()
    const operation = kind => () => new Observable(subscriber => {
        const entry = {kind, subscriber}
        operations.push(entry)
    })
    return {
        operations,
        sourceRuntime: {
            resolveImageOutput$: operation('DESCRIBE'),
            completeDependencies$: operation('DEPENDENCIES'),
            identity$: () => new Observable(subscriber => {
                listeners.add(subscriber)
                subscriber.next({})
                return () => listeners.delete(subscriber)
            })
        },
        changeCredentials: () => [...listeners].forEach(listener => listener.next({}))
    }
}

// A mounted layer over the records the real graph builder links. Re-rendering is React's; here the lifecycle is
// called as React would call it. The map merges what the layer writes into its config, as the store does.
const shown = ({recipe, records = [], visParams, layerConfig = {visParams}}) => {
    const runtime = runtimeOf()
    const updates = []
    const graphOf = recipe => buildRecipeDependencyGraph({
        rootRecipe: recipe,
        recipesById: new Map([recipe, ...records].map(record => [record.id, record]))
    })
    const rerender = () => instance.componentDidUpdate(instance.props)
    const updateLayerConfig = layerConfig => {
        updates.push(layerConfig)
        instance.props = {...instance.props, layerConfig: {...instance.props.layerConfig, ...layerConfig}}
        rerender()
    }
    const instance = new RecipeImageLayer({
        currentRecipe: recipe,
        recipe,
        sourceId: 'this-recipe',
        source: {id: 'this-recipe'},
        layerConfig,
        dependencyGraph: graphOf(recipe),
        sourceRuntime: runtime.sourceRuntime,
        map: {},
        mapArea: {updateLayerConfig},
        tab: {busy: {set: () => {}}},
        boundsChanged$: null,
        dragging$: null,
        cursor$: null
    })
    instance.forceUpdate = () => {}
    instance.componentDidMount()
    const settle = ({subscriber}, terminal) => {
        subscriber.next(terminal)
        subscriber.complete()
    }
    const setLayerConfig = next => {
        instance.props = {...instance.props, layerConfig: next}
        rerender()
    }
    const setRecipe = next => {
        instance.props = {...instance.props, recipe: next, currentRecipe: next, dependencyGraph: graphOf(next)}
        rerender()
    }
    return {instance, runtime, updates, settle, setLayerConfig, setRecipe, rerender}
}
