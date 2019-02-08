import moment from 'moment'

export const defaultModel = {
    step: 'init',
    // aoi: {},
    typology: {
        primitiveTypes: [ // TODO: Create a panel for collecting this data
            {id: 'forest', label: 'Forest', value: 2, color: '007D34'},
            {id: 'plantation', label: 'Plantation', value: 11, color: '93AA00'},
            {id: 'shrub', label: 'Shrub', value: 12, color: '593315'},
            {id: 'grass', label: 'Grass', value: 10, color: 'F4C800'},
            {id: 'crop', label: 'Crop', value: 7, color: 'FF8E00'},
            {id: 'paramo', label: 'Paramo', value: 9, color: 'CEA262'},
            {id: 'water', label: 'Water', value: 8, color: '00538A'},
            {id: 'urban', label: 'Urban', value: 6, color: '817066'},
            {id: 'barren', label: 'Barren', value: 0, color: 'F6768E'}
        ]
    },
    period: {
        startYear: 2000,
        endYear: moment().year()
    },
    compositeOptions: {
        cloudThreshold: 100,
        corrections: ['BRDF'],
        mask: ['CLOUDS', 'HAZE', 'SHADOW']
    },
    trainingData: {}
}
