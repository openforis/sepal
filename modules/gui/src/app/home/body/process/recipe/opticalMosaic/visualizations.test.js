import {vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {visualizationOptions} = await import('./visualizations')

// Candidate styles, whatever the data sets. Which apply is decided against the bands the mosaic's description
// resolves, where they are offered (registeredPresentation.test.js).

const recipeWithDataSets = dataSets => ({
    model: {
        sources: {dataSets},
        compositeOptions: {
            compose: 'MEDOID',
            corrections: []
        }
    }
})

const offeredBands = recipe =>
    visualizationOptions(recipe)
        .flatMap(({options}) => options)
        .map(({value}) => value)

it('offers the index styles as candidates even for data sets that cannot carry them', () => {
    const bands = offeredBands(recipeWithDataSets({SENTINEL_2: ['SENTINEL_2']}))

    expect(bands).toEqual(expect.arrayContaining(['nbi', 'bui', 'kndvi', 'ebbi']))
})
