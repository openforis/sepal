import {describe, expect, it, vi} from 'vitest'

// The layer forms that choose their own visualization - BAYTS Alerts, Change Alerts and LandTrendr - hold it to the
// rule every recipe layer does (visualizationMatching.js, visualizations.js), over the real read of the product their
// config names and the presets their picker offers. The area merges each write into the layer config, as the map does,
// and runs the form's update with it until the form writes nothing more. Only the selections written are asserted: how
// each form settles its own mode, filter and year is its own concern.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))

vi.mock('~/app/home/body/process/recipeTypeRegistry', async () => {
    const registered = {
        BAYTS_ALERTS: await import('./baytsAlerts/bands'),
        CHANGE_ALERTS: await import('./changeAlerts/bands'),
        LANDTRENDR: await import('./landTrendr/bands')
    }
    return {
        getRecipeType: type => {
            const {bandPresentation, mapProducts} = registered[type] || {}
            return {bandPresentation, mapProducts}
        }
    }
})

const {BaytsAlertsImageLayer} = await import('./baytsAlerts/baytsAlertsImageLayer')
const {ChangeAlertsImageLayer} = await import('./changeAlerts/changeAlertsImageLayer')
const {LandTrendrImageLayer} = await import('./landTrendr/landTrendrImageLayer')
const {buildMapDependencyGraph} = await import('./mapDependencyGraph')
const {layerProduct, readRecipeOutput} = await import('./recipeOutput')

const DRAWN_AOI = {type: 'POLYGON', path: [[-60.1, -3.1], [-60, -3.1], [-60, -3], [-60.1, -3.1]]}

const FORMS = [
    {
        name: 'BAYTS Alerts',
        Form: BaytsAlertsImageLayer,
        recipe: ({initialized = true, reference = {type: 'ASSET', id: 'users/x/bayts-historical'}} = {}) => ({
            id: 'bayts-1',
            type: 'BAYTS_ALERTS',
            ui: {initialized},
            model: {
                reference,
                date: {monitoringEnd: '2024-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months'},
                options: {orbits: ['ASCENDING', 'DESCENDING']},
                baytsAlertsOptions: {}
            }
        }),
        unresolved: {reference: {type: 'RECIPE', id: 'historical-1'}},
        layerConfig: {visualizationType: 'alerts', previouslyConfirmed: 'exclude', minConfidence: 'high'},
        ownBand: 'flag',
        transition: {to: 'first', first: ['VV', 'VH', 'ratio_VV_VH']}
    },
    {
        name: 'Change Alerts',
        Form: ChangeAlertsImageLayer,
        recipe: ({initialized = true, reference = {type: 'ASSET', id: 'users/x/segments'}} = {}) => ({
            id: 'change-alerts-1',
            type: 'CHANGE_ALERTS',
            ui: {initialized},
            model: {
                reference,
                date: {
                    monitoringEnd: '2024-01-01',
                    monitoringDuration: 2,
                    monitoringDurationUnit: 'months',
                    calibrationDuration: 3,
                    calibrationDurationUnit: 'months'
                },
                sources: {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}},
                options: {corrections: ['SR']},
                changeAlertsOptions: {minConfidence: 5, numberOfObservations: 3, minNumberOfChanges: 3}
            }
        }),
        unresolved: {reference: {type: 'RECIPE', id: 'ccdc-1'}},
        layerConfig: {visualizationType: 'changes', mosaicType: 'latest'},
        ownBand: 'confidence',
        transition: {to: 'monitoring', first: ['red', 'green', 'blue']}
    },
    {
        name: 'LandTrendr',
        Form: LandTrendrImageLayer,
        recipe: ({initialized = true, aoi = DRAWN_AOI} = {}) => ({
            id: 'landtrendr-1',
            type: 'LANDTRENDR',
            ui: {initialized},
            model: {
                aoi,
                dates: {startYear: 2014, endYear: 2021},
                sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'nbr'},
                options: {corrections: ['SR']},
                landTrendrOptions: {}
            }
        }),
        unresolved: {aoi: {type: 'RECIPE', id: 'aoi-1'}},
        layerConfig: {visualizationType: 'changes'},
        ownBand: 'dur',
        transition: {to: 'mosaics', first: ['red', 'green', 'blue']}
    }
]

describe.each(FORMS)('the $name layer form', ({Form, recipe, unresolved, layerConfig, ownBand, transition}) => {
    const OWN_STYLE = {id: 'own-style', bands: [ownBand], type: 'continuous', min: [0], max: [1]}

    describe('in another recipe\'s map', () => {
        it('selects a style the shown recipe owns first, as its picker offers it', () => {
            const shown = area(Form, {recipe: withOwnStyles(recipe(), [OWN_STYLE]), layerConfig, inAnotherRecipe: true})

            expect(shown.selections()).toEqual([OWN_STYLE])
        })

        it('keeps that style selected however often the layer re-renders', () => {
            const shown = area(Form, {
                recipe: withOwnStyles(recipe(), [OWN_STYLE]),
                layerConfig: {...layerConfig, visParams: OWN_STYLE},
                inAnotherRecipe: true
            })

            shown.rerender()
            shown.rerender()

            expect(shown.selections()).toEqual([])
        })
    })

    it('selects nothing before the recipe is set up', () => {
        const shown = area(Form, {recipe: recipe({initialized: false}), layerConfig})

        shown.rerender()

        expect(shown.selections()).toEqual([])
    })

    it('selects nothing while the dependencies are unresolved', () => {
        const shown = area(Form, {recipe: recipe(unresolved), layerConfig})

        shown.rerender()

        expect(shown.selections()).toEqual([])
    })

    it('selects the first style of the mode it switches to, once', () => {
        const shown = area(Form, {recipe: recipe(), layerConfig})
        shown.writes.length = 0

        shown.chooseMode(transition.to)
        shown.rerender()

        expect(shown.selections().map(({bands}) => bands)).toEqual([transition.first])
    })
})

const withOwnStyles = (recipe, styles) => ({...recipe, layers: {userDefinedVisualizations: {'this-recipe': styles}}})

// A map area showing the recipe's layer, mounted - on the recipe's own map, or on another recipe's that shows it
// through a layer source of its own. A form that keeps writing never settles, and fails here.
const area = (Form, {recipe, layerConfig, inAnotherRecipe = false}) => {
    const writes = []
    const pending = []
    const currentRecipe = inAnotherRecipe ? {id: 'host-1', type: 'MOSAIC', model: {}, ui: {initialized: true}} : recipe
    const propsFor = layerConfig => ({
        initialized: currentRecipe.ui.initialized,
        map: {},
        layer: null,
        currentRecipe,
        recipe,
        source: {id: inAnotherRecipe ? 'layer-source-1' : 'this-recipe'},
        dates: recipe.model.dates,
        layerConfig,
        imageOutput: readRecipeOutput({
            recipe,
            product: layerProduct(recipe, layerConfig),
            graph: buildMapDependencyGraph({recipe, loadedRecipes: {[recipe.id]: recipe}}),
            heldFor: () => null
        }),
        mapArea: {updateLayerConfig: changes => pending.push(changes)}
    })
    const instance = new Form(propsFor(layerConfig))
    const settle = () => {
        for (let rounds = 0; pending.length; rounds++) {
            if (rounds === 10) {
                throw new Error(`The layer form did not settle: ${JSON.stringify(pending)}`)
            }
            const changes = pending.shift()
            writes.push(changes)
            const previous = instance.props
            instance.props = propsFor({...instance.props.layerConfig, ...changes})
            instance.componentDidUpdate(previous)
        }
    }
    instance.componentDidMount()
    settle()
    return {
        writes,
        selections: () => writes.filter(changes => 'visParams' in changes).map(({visParams}) => visParams),
        layerConfig: () => instance.props.layerConfig,
        rerender: () => {
            instance.componentDidUpdate(instance.props)
            settle()
        },
        chooseMode: visualizationType => {
            instance.renderVisualizationType().props.onChange(visualizationType)
            settle()
        }
    }
}
