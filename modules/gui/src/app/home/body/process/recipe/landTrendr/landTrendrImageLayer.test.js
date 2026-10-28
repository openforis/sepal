import _ from 'lodash'
import {describe, expect, it, vi} from 'vitest'

// The LandTrendr layer form in a map area, over the real read of the product its config names. The area merges each
// write into the layer config, as the map does, and re-renders the form with it until the form writes nothing more.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))

vi.mock('~/app/home/body/process/recipeTypeRegistry', async () => {
    const {bandPresentation, mapProducts} = await import('./bands')
    return {getRecipeType: () => ({bandPresentation, mapProducts})}
})

const {Combo} = await import('~/widget/combo')
const {LandTrendrImageLayer} = await import('./landTrendrImageLayer')
const {buildMapDependencyGraph} = await import('../mapDependencyGraph')
const {canPreview, layerProduct, productArgs, readRecipeOutput} = await import('../recipeOutput')

describe('the year an annual mosaic layer selects', () => {
    it('follows the end year down past it, in the picker and the preview', () => {
        const shown = area({visualizationType: 'mosaics', year: 2025}, landTrendr({endYear: 2025}))

        shown.showRecipe(landTrendr({endYear: 2024}))

        expect(shown.yearControl().props.value).toBe(2024)
        expect(shown.yearControl().props.options.map(({value}) => value)).toEqual(_.range(2014, 2025))
        expect(shown.previewArgs()).toEqual({visualizationType: 'mosaics', year: 2024})
        expect(shown.read().description.output.product.parameters).toEqual({year: 2024})
    })

    it('follows the start year up past it', () => {
        const shown = area({visualizationType: 'mosaics', year: 2015})

        shown.showRecipe(landTrendr({startYear: 2017}))

        expect(shown.yearControl().props.value).toBe(2017)
        expect(shown.previewArgs()).toEqual({visualizationType: 'mosaics', year: 2017})
    })

    it('is brought into the fitted period while the layer shows the changes', () => {
        const shown = area({visualizationType: 'changes', year: 2025}, landTrendr({endYear: 2025}))

        shown.showRecipe(landTrendr({endYear: 2024}))

        expect(shown.layerConfig().year).toBe(2024)
    })

    it('stays as selected while it remains in the fitted period, writing nothing', () => {
        const shown = area({visualizationType: 'mosaics', year: 2020}, landTrendr({endYear: 2025}))
        shown.writes.length = 0

        shown.showRecipe(landTrendr({endYear: 2024}))

        expect(shown.layerConfig().year).toBe(2020)
        expect(shown.writes).toEqual([])
    })

    it.each([
        ['none', undefined, 2021],
        ['null', null, 2021],
        ['one after the fitted period', 2030, 2021],
        ['one before it', 2010, 2014]
    ])('of a restored layer that stored %s is brought into the fitted period when shown, and never written back', (_case, year, selected) => {
        const shown = area({visualizationType: 'mosaics', year})

        expect(shown.writes[0]).toEqual({year: selected})
        expect(_.uniq(shown.writes.filter(changes => 'year' in changes).map(({year}) => year))).toEqual([selected])
        expect(shown.yearControl().props.value).toBe(selected)
        expect(shown.layerConfig().visParams.bands).toEqual(['red', 'green', 'blue'])
    })

    it('is reconciled in each map area on its own, keeping each selection still in the period', () => {
        const recipe = landTrendr({endYear: 2025})
        const areas = [area({visualizationType: 'mosaics', year: 2025}, recipe), area({visualizationType: 'mosaics', year: 2019}, recipe)]

        areas.forEach(shown => shown.showRecipe(landTrendr({endYear: 2024})))

        expect(areas.map(shown => shown.layerConfig().year)).toEqual([2024, 2019])
    })

    it('is written once when reconciled, keeping the style, and not again however often the layer re-renders', () => {
        const shown = area({visualizationType: 'mosaics', year: 2025}, landTrendr({endYear: 2025}))
        const style = shown.layerConfig().visParams
        shown.writes.length = 0

        shown.showRecipe(landTrendr({endYear: 2024}))
        shown.rerender()
        shown.rerender()

        expect(shown.writes).toEqual([{year: 2024}])
        expect(shown.layerConfig().visParams).toEqual(style)
        expect(style.bands).toEqual(['red', 'green', 'blue'])
    })
})

// The map mounts the layer it is handed before the form can write anything, so a layer for a year about to be replaced
// would already be requested.
describe('the layer an annual mosaic area is handed', () => {
    it('is withheld from the first render of a restored layer whose year is outside the fitted period', () => {
        const shown = area({visualizationType: 'mosaics', year: 2030})

        expect(shown.handed[0]).toBe(null)
        expect(requestedYears(shown.handed)).toEqual([2021])
    })

    it('is withheld while a shortened period is reconciled, then handed over for the reconciled year', () => {
        const shown = area({visualizationType: 'mosaics', year: 2025}, landTrendr({endYear: 2025}))
        shown.handed.length = 0

        shown.showRecipe(landTrendr({endYear: 2024}))

        expect(shown.handed[0]).toBe(null)
        expect(requestedYears(shown.handed)).toEqual([2024])
    })
})

describe('a stored year that is not a year', () => {
    it('is left in the picker to replace, with no styles and no preview, and they return once a year is chosen', () => {
        const shown = area({visualizationType: 'mosaics', year: '2020'})
        expect(shown.writes).toEqual([])
        expect(shown.yearControl().props.value).toBe('2020')
        expect(shown.presets()).toEqual([])
        expect(canPreview(shown.read())).toBe(false)

        shown.choose(2019)

        expect(shown.layerConfig()).toMatchObject({year: 2019, visParams: {bands: ['red', 'green', 'blue']}})
        expect(shown.presets()).not.toEqual([])
        expect(canPreview(shown.read())).toBe(true)
    })
})

const landTrendr = ({startYear = 2014, endYear = 2021} = {}) => ({
    id: 'landtrendr-1',
    type: 'LANDTRENDR',
    ui: {initialized: true},
    model: {
        aoi: {type: 'POLYGON', path: [[-60.1, -3.1], [-60, -3.1], [-60, -3], [-60.1, -3.1]]},
        dates: {startYear, endYear},
        sources: {dataSets: {LANDSAT: ['LANDSAT_8']}, index: 'nbr'},
        options: {corrections: ['SR']},
        landTrendrOptions: {}
    }
})

// The years the layers an area was handed would request, in order.
const requestedYears = layers =>
    _.uniq(layers.filter(Boolean).map(({previewRequest}) => previewRequest.year))

const readOf = (recipe, layerConfig) => readRecipeOutput({
    recipe,
    product: layerProduct(recipe, layerConfig),
    graph: buildMapDependencyGraph({recipe, loadedRecipes: {[recipe.id]: recipe}}),
    heldFor: () => null
})

// A map area showing the recipe's layer, mounted. A form that keeps writing never settles, and fails here.
const area = (layerConfig, recipe = landTrendr()) => {
    const writes = []
    const pending = []
    const propsFor = (recipe, layerConfig) => ({
        initialized: true,
        map: {},
        // What the surrounding layer builds for this config: a preview of the product it names.
        layer: {previewRequest: productArgs(recipe, layerConfig)},
        recipe,
        source: {id: 'this-recipe'},
        dates: recipe.model.dates,
        userDefinedVisualizations: [],
        layerConfig,
        imageOutput: readOf(recipe, layerConfig),
        mapArea: {updateLayerConfig: changes => pending.push(changes)}
    })
    const handed = []
    const instance = new LandTrendrImageLayer(propsFor(recipe, layerConfig))
    // React renders before it runs the lifecycle, and the map takes the layer from that render.
    const renderOf = () => handed.push(instance.render().props.layer)
    const render = props => {
        const previous = instance.props
        instance.props = props
        renderOf()
        instance.componentDidUpdate(previous)
    }
    const settle = () => {
        for (let rounds = 0; pending.length; rounds++) {
            if (rounds === 10) {
                throw new Error(`The layer form did not settle: ${JSON.stringify(pending)}`)
            }
            const changes = pending.shift()
            writes.push(changes)
            render(propsFor(instance.props.recipe, {...instance.props.layerConfig, ...changes}))
        }
    }
    renderOf()
    instance.componentDidMount()
    settle()
    const yearControl = () => instance.renderImageLayerForm().props.children.find(child => child?.type === Combo)
    return {
        writes,
        handed,
        layerConfig: () => instance.props.layerConfig,
        read: () => instance.props.imageOutput,
        previewArgs: () => productArgs(instance.props.recipe, instance.props.layerConfig),
        yearControl,
        presets: () => instance.renderVisualizationSelector().props.presetOptions,
        showRecipe: recipe => {
            render(propsFor(recipe, instance.props.layerConfig))
            settle()
        },
        rerender: () => {
            render({...instance.props})
            settle()
        },
        choose: year => {
            yearControl().props.onChange({value: year})
            settle()
        }
    }
}
