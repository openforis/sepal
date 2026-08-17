import {vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {visualizationOptions} = await import('./visualizations')

const recipeWithDataSets = dataSets => ({
    model: {
        sources: {dataSets},
        compositeOptions: {
            compose: 'MEDOID',
            corrections: []
        }
    }
})

const availableVisualizationBands = recipe =>
    visualizationOptions(recipe)
        .flatMap(({options}) => options)
        .map(({value}) => value)

it('excludes EBBI from Sentinel-2 map visualization options', () => {
    const bands = availableVisualizationBands(
        recipeWithDataSets({SENTINEL_2: ['SENTINEL_2']})
    )

    expect(bands).toContain('nbi')
    expect(bands).not.toContain('ebbi')
})

it('includes EBBI in Landsat map visualization options', () => {
    const bands = availableVisualizationBands(
        recipeWithDataSets({LANDSAT: ['LANDSAT_8']})
    )

    expect(bands).toContain('ebbi')
})
