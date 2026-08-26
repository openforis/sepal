import {getAvailableIndexes} from '~/app/home/body/process/opticalIndexes'

import {getDataSetBands} from './sources'

export const getIndexes = recipe =>
    getAvailableIndexes(getDataSetBands(recipe))
