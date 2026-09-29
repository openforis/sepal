import {describe, expect, it, vi} from 'vitest'

// The Change Alerts layer form over a saved recipe whose mosaic cannot be built: dates or sources an initialized recipe
// can still hold. The form reads the product as the map does and settles as the map area merges its writes; what it
// offers is read from its own controls.

vi.mock('~/compose', () => ({
    compose: Component => Component,
    composeHoC: () => Component => Component
}))

vi.mock('~/translate', () => ({msg: key => (Array.isArray(key) ? key.join('.') : key)}))

vi.mock('~/app/home/body/process/recipeTypeRegistry', async () => {
    const {bandPresentation, mapProducts} = await import('./bands')
    return {getRecipeType: () => ({bandPresentation, mapProducts})}
})

const {ChangeAlertsImageLayer} = await import('./changeAlertsImageLayer')
const {buildMapDependencyGraph} = await import('../mapDependencyGraph')
const {canPreview, layerProduct, readRecipeOutput} = await import('../recipeOutput')

describe.each([
    ['dates that name no day', {date: {monitoringEnd: '2024-02-30'}}],
    ['a Planet source without a Planet collection', {sources: {dataSetType: 'PLANET', dataSets: {}, assets: ['users/x/daily']}}]
])('the Change Alerts layer form over %s', (_case, broken) => {
    const MOSAIC = {visualizationType: 'monitoring', mosaicType: 'latest'}

    it('offers no mosaic style and no preview, and still changes mode', () => {
        const form = layerForm({recipe: changeAlerts(broken), layerConfig: MOSAIC})

        expect(form.presets()).toEqual([])
        expect(form.selections()).toEqual([])
        expect(form.previewable()).toBe(false)

        form.chooseMode('changes')

        expect(form.selections().map(({bands}) => bands)).toEqual([['confidence']])
        expect(form.previewable()).toBe(true)
    })

    it('selects the mosaic\'s first style, and can be previewed, once the recipe is corrected', () => {
        const form = layerForm({recipe: changeAlerts(broken), layerConfig: MOSAIC})

        form.edit(changeAlerts())

        expect(form.selections().map(({bands}) => bands)).toEqual([['red', 'green', 'blue']])
        expect(form.presets()).not.toEqual([])
        expect(form.previewable()).toBe(true)
    })
})

// The change styles are drawn over the period's dates, so a period that cannot be computed offers none in either mode,
// rather than one whose range is unknown.
describe.each([
    ['a period reaching before year 0', {monitoringEnd: '0000-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months'}],
    ['a duration that is no number', {calibrationDuration: 'three'}],
    ['a unit it cannot count', {monitoringDurationUnit: 'fortnights'}]
])('the Change Alerts layer form over %s', (_case, date) => {
    const MOSAIC = {visualizationType: 'monitoring', mosaicType: 'latest'}

    it('offers no style and no preview in either mode, and switches between them', () => {
        const form = layerForm({recipe: changeAlerts({date}), layerConfig: MOSAIC})

        form.chooseMode('changes')

        expect(form.presets()).toEqual([])
        expect(form.selections()).toEqual([])
        expect(form.previewable()).toBe(false)

        form.chooseMode('calibration')

        expect(form.layerConfig().visualizationType).toBe('calibration')
        expect(form.presets()).toEqual([])
        expect(form.previewable()).toBe(false)
    })

    it('selects the first style of the mode it shows once the period is corrected, in either mode', () => {
        const form = layerForm({recipe: changeAlerts({date}), layerConfig: MOSAIC})
        form.chooseMode('changes')

        form.edit(changeAlerts())

        expect(form.selections().map(({bands}) => bands)).toEqual([['confidence']])
        expect(form.previewable()).toBe(true)

        form.chooseMode('monitoring')

        expect(form.selections().map(({bands}) => bands)).toEqual([['red', 'green', 'blue']])
        expect(form.previewable()).toBe(true)
    })
})

const changeAlerts = ({date = {}, sources = {}} = {}) => ({
    id: 'change-alerts-1',
    type: 'CHANGE_ALERTS',
    ui: {initialized: true},
    model: {
        reference: {type: 'ASSET', id: 'users/x/segments'},
        date: {
            monitoringEnd: '2024-01-01', monitoringDuration: 2, monitoringDurationUnit: 'months',
            calibrationDuration: 3, calibrationDurationUnit: 'months',
            ...date
        },
        sources: sources.dataSetType
            ? {band: 'ndvi', ...sources}
            : {band: 'ndvi', dataSetType: 'OPTICAL', dataSets: {LANDSAT: ['LANDSAT_8']}},
        options: {corrections: ['SR']},
        changeAlertsOptions: {minConfidence: 5, numberOfObservations: 3, minNumberOfChanges: 3}
    }
})

// The form mounted on its recipe's own map, rendered after every change. A form that keeps writing never settles, and
// fails here.
const layerForm = ({recipe, layerConfig}) => {
    const writes = []
    const pending = []
    const propsFor = (recipe, layerConfig) => ({
        initialized: recipe.ui.initialized,
        map: {},
        layer: null,
        currentRecipe: recipe,
        recipe,
        source: {id: 'this-recipe'},
        layerConfig,
        imageOutput: readRecipeOutput({
            recipe,
            product: layerProduct(recipe, layerConfig),
            graph: buildMapDependencyGraph({recipe, loadedRecipes: {[recipe.id]: recipe}}),
            heldFor: () => null
        }),
        mapArea: {updateLayerConfig: changes => pending.push(changes)}
    })
    const form = new ChangeAlertsImageLayer(propsFor(recipe, layerConfig))
    const update = props => {
        const previous = form.props
        form.props = props
        form.render()
        form.componentDidUpdate(previous)
    }
    const settle = () => {
        for (let rounds = 0; pending.length; rounds++) {
            if (rounds === 10) {
                throw new Error(`The layer form did not settle: ${JSON.stringify(pending)}`)
            }
            const changes = pending.shift()
            writes.push(changes)
            update(propsFor(form.props.recipe, {...form.props.layerConfig, ...changes}))
        }
    }
    form.render()
    form.componentDidMount()
    settle()
    return {
        presets: () => form.renderVisualizationSelector().props.presetOptions,
        selections: () => writes.filter(changes => 'visParams' in changes).map(({visParams}) => visParams),
        layerConfig: () => form.props.layerConfig,
        previewable: () => canPreview(form.props.imageOutput) && Boolean(form.props.layerConfig.visParams),
        chooseMode: visualizationType => {
            writes.length = 0
            form.renderVisualizationType().props.onChange(visualizationType)
            settle()
        },
        edit: recipe => {
            writes.length = 0
            update(propsFor(recipe, form.props.layerConfig))
            settle()
        }
    }
}
