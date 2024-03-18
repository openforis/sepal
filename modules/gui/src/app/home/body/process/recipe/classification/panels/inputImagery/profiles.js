import {BandSetSpec} from './bandSetSpec'
import {uuid} from '~/uuid'

const profilesByName = {
    SIMPLE: bands => ({
        disabled: !bands.find(band => ['red', 'nir', 'swir1', 'swir2'].includes(band)),
        bandSetSpecs: [{
            id: uuid(),
            type: 'IMAGE_BANDS',
            included: ['red', 'nir', 'swir1', 'swir2']
        }, {
            id: uuid(),
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
            id: uuid(),
            type: 'IMAGE_BANDS',
            included: bands
        }, {
            id: uuid(),
            type: 'PAIR_WISE_EXPRESSION',
            operation: 'NORMALIZED_DIFFERENCE',
            included: ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
        }, {
            id: uuid(),
            type: 'PAIR_WISE_EXPRESSION',
            operation: 'RATIO',
            included: ['swir1', 'nir']
        }, {
            id: uuid(),
            type: 'PAIR_WISE_EXPRESSION',
            operation: 'RATIO',
            included: ['red', 'swir1']
        }, {
            id: uuid(),
            type: 'INDEXES',
            included: ['evi', 'savi', 'ibi']
        }, {
            id: uuid(),
            type: 'PAIR_WISE_EXPRESSION',
            operation: 'ANGLE',
            included: ['brightness', 'greenness', 'wetness']
        }, {
            id: uuid(),
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
            .map(spec => ({...spec, includes: BandSetSpec.filter(spec, availableBands)}))
            .filter(spec => !BandSetSpec.isEmpty(spec, availableBands))
        : []
