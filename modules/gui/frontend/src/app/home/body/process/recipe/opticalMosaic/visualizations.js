export const visualizations = {
    TOA: [
        {
            type: 'rgb',
            bands: ['red', 'green', 'blue'],
            min: [200, 400, 600],
            max: [2400, 2200, 2400],
            gamma: [1.2, 1.2, 1.2]
        },
        {
            type: 'rgb',
            bands: ['nir', 'red', 'green'],
            min: [500, 200, 400],
            max: [5000, 2400, 2200],
        },
        {
            type: 'rgb',
            bands: ['nir', 'swir1', 'red'],
            min: [0, 0, 0],
            max: [5000, 5000, 5000],
            gamma: [1.5, 1.5, 1.5]
        },
        {
            type: 'rgb',
            bands: ['swir2', 'nir', 'red'],
            min: [0, 500, 200],
            max: [1800, 6000, 3500],
        },
        {
            type: 'rgb',
            bands: ['swir2', 'swir1', 'red'],
            min: [0, 500, 200],
            max: [1800, 3000, 2400],
        },
        {
            type: 'rgb',
            bands: ['swir2', 'nir', 'green'],
            min: [0, 500, 400],
            max: [1800, 6000, 3500],
        },
        {
            type: 'rgb',
            bands: ['brightness', 'greenness', 'wetness'],
            min: [1000, -1000, -1800],
            max: [7000, 1800, 3200],
        }
    ],
    SR: [
        {
            type: 'rgb',
            bands: ['red', 'green', 'blue'],
            min: [300, 100, 0],
            max: [2500, 2500, 2300],
            gamma: [1.3, 1.3, 1.3]
        },
        {
            type: 'rgb',
            bands: ['nir', 'red', 'green'],
            min: [500, 200, 100],
            max: [5000, 2400, 2500],
        },
        {
            type: 'rgb',
            bands: ['nir', 'swir1', 'red'],
            min: [0, 0, 0],
            max: [5000, 5000, 3000],
            gamma: [1.3, 1.3, 1.3]
        },
        {
            type: 'rgb',
            bands: ['swir2', 'nir', 'red'],
            min: [100, 500, 300],
            max: [2000, 6000, 2500],
        },
        {
            type: 'rgb',
            bands: ['swir2', 'swir1', 'red'],
            min: [100, 200, 300],
            max: [3300, 4800, 3100],
        },
        {
            type: 'rgb',
            bands: ['swir2', 'nir', 'green'],
            min: [100, 500, 400],
            max: [3300, 7500, 3000],
        },
        {
            type: 'rgb',
            bands: ['brightness', 'greenness', 'wetness'],
            min: [1000, -1000, -1800],
            max: [7000, 1800, 3200],
        }
    ],
    metadata: [
        {
            type: 'continuous',
            bands: ['dayOfYear'],
            min: [0],
            max: [366],
            palette: ['00FFFF', '000099']
        },
        {
            type: 'continuous',
            bands: ['daysFromTarget'],
            min: [0],
            max: [183],
            palette: ['00FF00', 'FF0000']
        }
    ],
    indexes: [ // TODO: Tweak min/max/palette
        {type: 'continuous', bands: ['ndvi'], min: [-10000], max: [10000], palette: ['red', 'white', 'green']},
        {type: 'continuous', bands: ['ndmi'], min: [-10000], max: [10000], palette: ['red', 'white', 'green']},
        {type: 'continuous', bands: ['ndwi'], min: [-10000], max: [10000], palette: ['green', 'white', 'blue']},
        {type: 'continuous', bands: ['mndwi'], min: [-10000], max: [10000], palette: ['green', 'white', 'blue']},
        {type: 'continuous', bands: ['ndfi'], min: [-10000], max: [10000], palette: ['red', 'white', 'green']},
        {type: 'continuous', bands: ['evi'], min: [-10000], max: [10000], palette: ['red', 'white', 'green']},
        {type: 'continuous', bands: ['evi2'], min: [-10000], max: [10000], palette: ['red', 'white', 'green']},
        {type: 'continuous', bands: ['savi'], min: [-10000], max: [10000], palette: ['red', 'white', 'green']},
        {type: 'continuous', bands: ['nbr'], min: [-10000], max: [10000], palette: ['green', 'white', 'blue']},
        {type: 'continuous', bands: ['ui'], min: [-10000], max: [10000], palette: ['green', 'white', 'blue']},
        {type: 'continuous', bands: ['ndbi'], min: [-10000], max: [10000], palette: ['green', 'white', 'blue']},
        {type: 'continuous', bands: ['ibi'], min: [-10000], max: [10000], palette: ['green', 'white', 'blue']},
        {type: 'continuous', bands: ['nbi'], min: [-10000], max: [10000], palette: ['green', 'white', 'blue']},
        {type: 'continuous', bands: ['ebbi'], min: [-10000], max: [10000], palette: ['green', 'white', 'blue']},
        {type: 'continuous', bands: ['bui'], min: [-10000], max: [10000], palette: ['green', 'white', 'blue']},
    ]
}
