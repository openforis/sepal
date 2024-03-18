import {selectFrom} from '~/stateUtils'
import {uuid} from '~/uuid'
import _ from 'lodash'

export const validAreas = areas => {
    assertValidState(areas)
    const size = _.size(areas)
    if (size > 1) {
        return ['center', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'bottom-left', 'left', 'top-left']
    } else if (size === 1 && !selectFrom(areas, 'center.imageLayer.sourceId')) {
        return ['center']
    } else if (size > 0) {
        return ['center', 'top', 'right', 'bottom', 'left']
    } else {
        return ['center']
    }
}

export const swapAreas = ({areas, from, to}) => {
    const nextAreas = {
        ...areas,
        [from]: areas[to],
        [to]: areas[from]
    }
    return nextAreas
}

export const assignArea = ({areas, area, value}) => {
    assertValidState(areas)

    const newMask = maskByArea[area]
    const nextAreas = {[area]: value}
    Object.keys(areas)
        .map(area => ({value: areas[area], mask: maskByArea[area]}))
        .map(({value, mask}) => ({value, mask: updateMask(mask, newMask)}))
        .map(({value, mask}) => ({value, area: maskToArea(mask)}))
        .filter(({area}) => area)
        .forEach(({value, area}) => nextAreas[area] = value)
    return nextAreas
}

export const removeArea = ({areas, area}) => {
    const replacementMap = {
        top: areas => areas.bottom
            ? {center: areas.bottom}
            : {left: areas['bottom-left'], right: areas['bottom-right']},
        bottom: areas => areas.top
            ? {center: areas.top}
            : {left: areas['top-left'], right: areas['top-right']},
        left: areas => areas.right
            ? {center: areas.right}
            : {top: areas['top-right'], bottom: areas['bottom-right']},
        right: areas => areas.left
            ? {center: areas.left}
            : {top: areas['top-left'], bottom: areas['bottom-left']},
        'top-left': areas => areas.right
            ? {left: areas['bottom-left']}
            : {top: areas['top-right']},
        'top-right': areas => areas.left
            ? {right: areas['bottom-right']}
            : {top: areas['top-left']},
        'bottom-left': areas => areas.right
            ? {left: areas['top-left']}
            : {bottom: areas['bottom-right']},
        'bottom-right': areas => areas.left
            ? {right: areas['top-right']}
            : {bottom: areas['bottom-left']}
    }

    if (area === 'center') {
        return {
            center: {
                id: uuid(),
                imageLayer: {},
                featureLayers: []
            }
        }
    } else {
        const replacements = replacementMap[area]
        return _.reduce(
            replacements(areas),
            (areas, value, area) => assignArea({areas, area, value}),
            areas
        )
    }
}

const maskByArea = {
    'center': [
        [1, 1],
        [1, 1]
    ],
    'top': [
        [1, 1],
        [0, 0]
    ],
    'top-right': [
        [0, 1],
        [0, 0]
    ],
    'right': [
        [0, 1],
        [0, 1]
    ],
    'bottom-right': [
        [0, 0],
        [0, 1]
    ],
    'bottom': [
        [0, 0],
        [1, 1],
    ],
    'bottom-left': [
        [0, 0],
        [1, 0],
    ],
    'left': [
        [1, 0],
        [1, 0]
    ],
    'top-left': [
        [1, 0],
        [0, 0],
    ],
}

const assertValidState = areas => {
    const nullMask = _.flatten([
        [0, 0],
        [0, 0]
    ])

    const sum = (m1, m2) =>
        _.chain(m1)
            .zip(m2)
            .map(_.sum)
            .value()

    const valid = _.chain(areas)
        .keys()
        .map(area => _.flatten(maskByArea[area]))
        .reduce((acc, mask) => sum(acc, mask), nullMask)
        .every(value => value <= 1)
        .value()
    if (!valid) {
        throw Error(`Invalid areas: ${JSON.stringify(areas)}`)
    }
}

const maskToArea = mask =>
    Object.keys(maskByArea).find(area => _.isEqual(mask, maskByArea[area]))

const updateMask = (mask, remove) =>
    mask.map((row, rowIndex) =>
        row.map((cell, columnIndex) =>
            cell && !remove[rowIndex][columnIndex] ? 1 : 0
        )
    )
