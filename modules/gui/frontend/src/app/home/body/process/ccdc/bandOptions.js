import {msg} from 'translate'
import _ from 'lodash'
import {dataSetById} from 'sources'

const option = band => ({value: band, label: msg(['bands', band])})

export const opticalBandOptions = ({dataSets, alwaysSelected = []}) => {
    const indexOptions = {
        options: [
            {value: 'ndvi', label: 'NDVI', tooltip: '(nir - red) / (nir + red)'},
            {value: 'ndmi', label: 'NDMI', tooltip: '(nir - swir1) / (nir + swir1)'},
            {value: 'ndwi', label: 'NDWI', tooltip: '(green - nir) / (green + nir)'},
            {value: 'ndfi', label: 'NDFI', tooltip: 'Normalized Difference Fraction Index'},
            {value: 'nbr', label: 'NBR', tooltip: '(nir - swir2) / (nir + swir2)'},
            {value: 'evi', label: 'EVI', tooltip: '2.5 * (nir - red) / (nir + 6 * red - 7.5 * blue + 1)'},
            {value: 'evi2', label: 'EVI2', tooltip: '2.5 * (nir - red) / (nir + 2.4 * red + 1)'},
            {value: 'savi', label: 'SAVI', tooltip: '(1.5 * (nir - red) / (nir + red + 0.5)'}
        ].map(option => ({...option, alwaysSelected: alwaysSelected.includes(option.value)}))
    }
    const allBandOptions = [
        {
            options: [
                option('blue'),
                option('green'),
                option('red'),
                option('nir'),
                option('swir1'),
                option('swir2')
            ]
        },
        {
            options: [
                option('redEdge1'),
                option('redEdge2'),
                option('redEdge3'),
                option('redEdge4')
            ]
        },
        {
            options: [
                option('aerosol'),
                option('waterVapor'),
                option('pan'),
                option('cirrus'),
                option('thermal'),
                option('thermal2')
            ]
        },
        {
            options: [
                option('brightness'),
                option('greenness'),
                option('wetness')
            ]
        }
    ]

    const bandsForEachDataSet = _.flatten(Object.values(dataSets))
        .map(dataSetId => dataSetById[dataSetId]['TOA'].bands)
    const availableBands = new Set(
        _.intersection(...bandsForEachDataSet)
    )
    const bandOptions = allBandOptions
        .map(group => ({
                ...group,
                options: group.options
                    .filter(option => availableBands.has(option.value))
                    .map(option => ({...option, alwaysSelected: alwaysSelected.includes(option.value)}))
            })
        )
        .filter(group =>
            group.options.length
        )
    return [indexOptions, ...bandOptions]
}


export const radarBandOptions = ({alwaysSelected = []}) => ([
    {value: 'VV', label: 'VV'},
    {value: 'VH', label: 'VH'},
    {value: 'ratio_VV_VH', label: 'VV/VH'}
]).map(option => ({...option, alwaysSelected: alwaysSelected.includes(option.value)}))

export const filterBands = (bands, dataSets) =>
    _.isEmpty(dataSets['SENTINEL_1'])
        ? filterOpticalBands(bands, dataSets)
        : filterRadarBands(bands)

export const filterOpticalBands = (bands, dataSets) => {
    const availableBands = opticalBandOptions({dataSets})
        .map(({options}) => options)
        .flat()
        .map(({value}) => value)
    return _.intersection(availableBands, bands)
}

export const filterRadarBands = bands => {
    const availableBands = radarBandOptions({})
        .map(({value}) => value)
    return _.intersection(availableBands, bands)
}
