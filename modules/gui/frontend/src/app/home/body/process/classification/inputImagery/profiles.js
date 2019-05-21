import guid from 'guid'
import {filterBandSetSpec, isBandSetSpecEmpty} from './bandSetSpec'

const profilesByName = {
    SIMPLE: bands => ({
        disabled: !bands.find(band => ['red', 'nir', 'swir1', 'swir2'].includes(band)),
        bandSetSpecs: [{
            id: guid(),
            type: 'IMAGE_BANDS',
            class: 'IMAGE_BANDS',
            included: ['red', 'nir', 'swir1', 'swir2']
        }, {
            id: guid(),
            type: 'RATIO',
            class: 'PAIR_WISE_EXPRESSION',
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
            class: 'IMAGE_BANDS',
            included: bands
        }, {
            id: guid(),
            type: 'NORMALIZED_DIFFERENCE',
            class: 'PAIR_WISE_EXPRESSION',
            included: ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
        }, {
            id: guid(),
            type: 'RATIO',
            class: 'PAIR_WISE_EXPRESSION',
            included: ['swir1', 'nir']
        }, {
            id: guid(),
            type: 'RATIO',
            class: 'PAIR_WISE_EXPRESSION',
            included: ['red', 'swir1']
        }, {
            id: guid(),
            type: 'INDEXES',
            class: 'INDEXES',
            included: ['evi', 'savi', 'ibi']
        }, {
            id: guid(),
            type: 'ANGLE',
            class: 'PAIR_WISE_EXPRESSION',
            included: ['brightness', 'greenness', 'wetness']
        }, {
            id: guid(),
            type: 'DISTANCE',
            class: 'PAIR_WISE_EXPRESSION',
            included: ['brightness', 'greenness', 'wetness']
        }]
    })
}

export const isProfileDisabled = (profile, availableBands) =>
    availableBands ? profilesByName[profile](availableBands).disabled : true

export const getProfileBandSetSpecs = (profile, availableBands) =>
    availableBands
        ? profilesByName[profile](availableBands).bandSetSpecs
            .map(spec => filterBandSetSpec(spec, availableBands))
            .filter(spec => !isBandSetSpecEmpty(spec, availableBands))
        : []
