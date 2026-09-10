import {beforeEach, describe, expect, it, vi} from 'vitest'

// Narrow smoke tests for the render-time guard and the visualization reconciler. The durable rules - matching and
// applicability - are pure and tested in visualizationMatching.test.js; what is checked here is only that the
// component asks them at the right moment and acts on the answer. The stale cases select a style the band-name
// filter removes, so they also cover that the component applies that filter rather than merely importing it.
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

const availableBandsByType = vi.hoisted(() => ({}))

vi.mock('~/app/home/body/process/recipeTypeRegistry', () => ({
    getRecipeType: type => ({
        getAvailableBands: () => availableBandsByType[type],
        getPreSetVisualizations: () => []
    })
}))

const {RecipeImageLayer} = await import('./recipeImageLayer')

beforeEach(() => {
    state.constructed = []
    availableBandsByType.SYNTHETIC = {ndvi: {}, evi: {}}
    availableBandsByType.LANDTRENDR = {ndvi: {}}
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
const build = ({recipe, visParams, previousLayer}) => {
    const updates = []
    const instance = new RecipeImageLayer({
        currentRecipe: recipe,
        recipe,
        sourceId: 'this-recipe',
        source: {id: 'this-recipe'},
        layerConfig: visParams === undefined ? {} : {visParams},
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
    return {instance, updates, didUpdate, setRecipe}
}

const selections = updates => updates.map(({visParams}) => visParams)

const styles = userDefined => recipeOf({userDefined})

const VALID = {id: 'valid', bands: ['ndvi']}
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
            recipe: recipeOf({type: 'LANDTRENDR', userDefined: [{id: 'v1', bands: ['ndvi']}]}),
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
            availableBandsByType.LANDTRENDR = {}
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

        it('gets no layer even when it manages its own visualizations', () => {
            const {instance} = build({
                recipe: recipeOf({type: 'LANDTRENDR', userDefined: [{id: 'v1', bands: ['ndvi']}]}),
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

        it('selects the first one when nothing has ever been selected', () => {
            const {instance, updates} = build({recipe: styles([VALID])})

            instance.componentDidMount()

            expect(selections(updates)).toEqual([VALID])
        })

        // A selection whose bands are gone is still the user's choice. Replacing it with whatever happens to be
        // first silently changes what the map means, and the source change that would have restored it can no
        // longer do so.
        it('leaves a stale selection alone rather than choosing another', () => {
            const {updates, didUpdate} = build({
                recipe: styles([VALID, STALE_SELECTION]),
                visParams: STALE_SELECTION
            })

            didUpdate()

            expect(updates).toEqual([])
        })

        it('reuses a stale selection unchanged once its own candidate returns', () => {
            const {instance, updates, didUpdate} = build({
                recipe: styles([VALID, STALE_SELECTION]),
                visParams: STALE_SELECTION
            })

            didUpdate()
            availableBandsByType.SYNTHETIC = {ndvi: {}, evi: {}, gone: {}}
            didUpdate()

            expect(updates).toEqual([])
            expect(instance.maybeCreateLayer()).not.toBe(null)
            expect(state.constructed[0].visParams).toBe(STALE_SELECTION)
        })

        it('leaves a selection that still matches a candidate alone', () => {
            const {instance, updates, didUpdate} = build({recipe: styles([VALID]), visParams: VALID})

            instance.componentDidMount()
            didUpdate()

            expect(updates).toEqual([])
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

    // With no selection at all - the one case generic reconciliation still writes in. A stale selection would
    // prove nothing here, because nothing writes over one of those any more.
    it('leaves a self-managed recipe type to make its own first selection', () => {
        const {instance, updates, didUpdate} = build({
            recipe: recipeOf({type: 'LANDTRENDR', userDefined: [{id: 'v1', bands: ['ndvi']}]})
        })

        instance.componentDidMount()
        didUpdate()

        expect(updates).toEqual([])
    })
})
