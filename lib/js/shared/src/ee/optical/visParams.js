module.exports = {
    'TOA': {
        'red|green|blue': {
            'bands': 'red,green,blue',
            'min': '200, 400, 600',
            'max': '2400, 2200, 2400',
            'gamma': 1.2
        },
        'nir|red|green': {
            'bands': 'nir,red,green',
            'min': '500, 200, 400',
            'max': '5000, 2400, 2200'
        },
        'nir|swir1|red': {
            'bands': 'nir,swir1,red',
            'min': 0,
            'max': 5000,
            'gamma': 1.5
        },
        'swir2|nir|red': {
            'bands': 'swir2,nir,red',
            'min': '0, 500, 200',
            'max': '1800, 6000, 3500'
        },
        'swir2|swir1|red': {
            'bands': 'swir2,swir1,red',
            'min': '0, 500, 200',
            'max': '1800, 3000, 2400'
        },
        'swir2|nir|green': {
            'bands': 'swir2,nir,green',
            'min': '0, 500, 400',
            'max': '1800, 6000, 3500'
        },
        'brightness|greenness|wetness': {
            'bands': 'brightness,greenness,wetness',
            'min': '1000, -1000, -1800',
            'max': '7000, 1800, 3200'
        },
        'dayOfYear': {
            'bands': 'dayOfYear',
            'min': 0,
            'max': 366,
            'palette': '00FFFF, 000099'
        },
        'daysFromTarget': {
            'bands': 'daysFromTarget',
            'min': 0,
            'max': 183,
            'palette': '00FF00, FF0000'
        }
    },
    'SR': {
        'red|green|blue': {
            'bands': 'red,green,blue',
            'min': '300, 100, 0',
            'max': '2500, 2500, 2300',
            'gamma': 1.3
        },
        'nir|red|green': {
            'bands': 'nir,red,green',
            'min': '500, 200, 100',
            'max': '5000, 2400, 2500'
        },
        'nir|swir1|red': {
            'bands': 'nir,swir1,red',
            'min': 0,
            'max': '5000, 5000, 3000',
            'gamma': 1.3
        },
        'swir2|nir|red': {
            'bands': 'swir2,nir,red',
            'min': '100, 500, 300',
            'max': '2000, 6000, 2500'
        },
        'swir2|swir1|red': {
            'bands': 'swir2,swir1,red',
            'min': '100, 200, 300',
            'max': '3300, 4800, 3100'
        },
        'swir2|nir|green': {
            'bands': 'swir2,nir,green',
            'min': '100, 500, 400',
            'max': '3300, 7500, 3000'
        },
        'brightness|greenness|wetness': {
            'bands': 'brightness,greenness,wetness',
            'min': '1000, -1000, -1800',
            'max': '7000, 1800, 3200'
        },
        'dayOfYear': {
            'bands': 'dayOfYear',
            'min': 0,
            'max': 366,
            'palette': '00FFFF, 000099'
        },
        'daysFromTarget': {
            'bands': 'daysFromTarget',
            'min': 0,
            'max': 183,
            'palette': '00FF00, FF0000'
        }
    },
    'indexes': { // TODO: Tweak min/max/palette
        ndvi: {min: -10000, max: 10000, palette: 'red,white,green'},
        ndmi: {min: -10000, max: 10000, palette: 'red,white,green'},
        ndwi: {min: -10000, max: 10000, palette: 'green,white,blue'},
        mndwi: {min: -10000, max: 10000, palette: 'green,white,blue'},
        ndfi: {min: -10000, max: 10000, palette: 'red,white,green'},
        evi: {min: -10000, max: 10000, palette: 'red,white,green'},
        evi2: {min: -10000, max: 10000, palette: 'red,white,green'},
        savi: {min: -10000, max: 10000, palette: 'red,white,green'},
        nbr: {min: -10000, max: 10000, palette: 'green,white,blue'},
        ui: {min: -10000, max: 10000, palette: 'green,white,blue'},
        ndbi: {min: -10000, max: 10000, palette: 'green,white,blue'},
        ibi: {min: -10000, max: 10000, palette: 'green,white,blue'},
        nbi: {min: -10000, max: 10000, palette: 'green,white,blue'},
        ebbi: {min: -10000, max: 10000, palette: 'green,white,blue'},
        bui: {min: -10000, max: 10000, palette: 'green,white,blue'}
    }
}