import {BandSetSpec} from './bandSetSpec'
import guid from 'guid'

const profilesByName = {
    SIMPLE: bands => ({
        disabled: !bands.find(band => ['red', 'nir', 'swir1', 'swir2'].includes(band)),
        bandSetSpecs: [{
            id: guid(),
            type: 'IMAGE_BANDS',
            included: ['red', 'nir', 'swir1', 'swir2']
        }, {
            id: guid(),
            type: 'PAIR_WISE_EXPRESSION',
            operation: 'RATIO',
            included: ['red', 'nir', 'swir1', 'swir2']
        }]
    }),
    RLCMS: bands => ({
        disabled: !bands.find(band =>
            ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'brightness', 'greenness', 'wetness'].includes(band)
        ),
        bandSetSpecs: [{
            id: guid(),
            type: 'IMAGE_BANDS',
            included: bands
        }, {
            id: guid(),
            type: 'PAIR_WISE_EXPRESSION',
            operation: 'NORMALIZED_DIFFERENCE',
            included: ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
        }, {
            id: guid(),
            type: 'PAIR_WISE_EXPRESSION',
            operation: 'RATIO',
            included: ['swir1', 'nir']
        }, {
            id: guid(),
            type: 'PAIR_WISE_EXPRESSION',
            operation: 'RATIO',
            included: ['red', 'swir1']
        }, {
            id: guid(),
            type: 'INDEXES',
            included: ['evi', 'savi', 'ibi']
        }, {
            id: guid(),
            type: 'PAIR_WISE_EXPRESSION',
            operation: 'ANGLE',
            included: ['brightness', 'greenness', 'wetness']
        }, {
            id: guid(),
            type: 'PAIR_WISE_EXPRESSION',
            operation: 'DISTANCE',
            included: ['brightness', 'greenness', 'wetness']
        }]
    })
}

export const isProfileDisabled = (profile, availableBands) =>
    availableBands ? profilesByName[profile](availableBands).disabled : true

export const getProfileBandSetSpecs = (profile, availableBands) =>
    availableBands
        ? profilesByName[profile](availableBands).bandSetSpecs
            .map(spec => BandSetSpec.filter(spec, availableBands))
            .filter(spec => !BandSetSpec.isEmpty(spec, availableBands))
        : []
