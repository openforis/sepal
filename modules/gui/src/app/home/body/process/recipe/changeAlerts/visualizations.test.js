import {vi} from 'vitest'

vi.mock('~/translate', () => ({msg: id => id}))

const {visualizationOptions} = await import('./visualizations')

it('provides visualization options for optical monitoring mosaics', () => {
    const recipe = {
        model: {
            sources: {
                dataSetType: 'OPTICAL',
                dataSets: {SENTINEL_2: ['SENTINEL_2']}
            },
            options: {corrections: []},
            date: {
                monitoringEnd: '2024-06-15',
                monitoringDuration: 2,
                monitoringDurationUnit: 'months',
                calibrationDuration: 3,
                calibrationDurationUnit: 'months'
            }
        }
    }

    const bands = visualizationOptions(recipe, 'monitoring', 'latest')
        .flatMap(({options}) => options)
        .map(({value}) => value)

    expect(bands).toContain('ndvi')
})
