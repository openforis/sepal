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
    'indexes': {
        ndvi: {min: -10000, max: 10000, palette: ['#112040', '#1c67a0', '#6db6b3', '#fffccc', '#abac21', '#177228', '#172313']},
        ndmi: {min: -10000, max: 10000, palette: ['#FD3000', '#FF8410', '#FCC228', '#B3C120', '#4DA910', '#1E7D83', '#0034F5']},
        ndwi: {min: -10000, max: 10000, palette: ['#F7ECE5', '#C4CA39', '#37B200', '#00834B', '#114E81', '#2C1C5D', '#040404']},
        mndwi: {min: -10000, max: 10000, palette: ['#F7ECE5', '#C4CA39', '#37B200', '#00834B', '#114E81', '#2C1C5D', '#040404']},
        ndfi: {min: -10000, max: 10000, palette: ['#ED4744', '#F78579', '#F9BAB2', '#EDEAE6', '#B7D2A7', '#7DB461', '#39970E']},
        evi: {min: -10000, max: 10000, palette: ['#112040', '#1c67a0', '#6db6b3', '#fffccc', '#abac21', '#177228', '#172313']},
        evi2: {min: -10000, max: 10000, palette: ['#112040', '#1c67a0', '#6db6b3', '#fffccc', '#abac21', '#177228', '#172313']},
        savi: {min: -10000, max: 10000, palette: ['#112040', '#1c67a0', '#6db6b3', '#fffccc', '#abac21', '#177228', '#172313']},
        nbr: {min: -10000, max: 10000, palette: ['#0034F5', '#1E7D83', '#4DA910', '#B3C120', '#FCC228', '#FF8410', '#FD3000']},
        mvi: {min: -10000, max: 10000, palette: ['#112040', '#1c67a0', '#6db6b3', '#fffccc', '#abac21', '#177228', '#172313']},
        ui: {min: -10000, max: 0, palette: ['#0034F5', '#1E7D83', '#4DA910', '#B3C120', '#FCC228', '#FF8410', '#FD3000']},
        ndbi: {min: -6000, max: 2000, palette: ['#0034F5', '#1E7D83', '#4DA910', '#B3C120', '#FCC228', '#FF8410', '#FD3000']},
        ibi: {min: -32800, max: 32800, palette: ['#FD3000', '#FF8410', '#FCC228', '#B3C120', '#4DA910', '#1E7D83', '#0034F5']},
        nbi: {min: 0, max: 2000, palette: ['#0034F5', '#1E7D83', '#4DA910', '#B3C120', '#FCC228', '#FF8410', '#FD3000']},
        ebbi: {min: -500, max: 100, palette: ['#0034F5', '#1E7D83', '#4DA910', '#B3C120', '#FCC228', '#FF8410', '#FD3000']},
        bui: {min: -15000, max: 0, palette: ['#0034F5', '#1E7D83', '#4DA910', '#B3C120', '#FCC228', '#FF8410', '#FD3000']},
        kndvi: {min: 0, max: 10000, palette: ['#0034F5', '#1E7D83', '#4DA910', '#B3C120', '#FCC228', '#FF8410', '#FD3000']},
    }
}
