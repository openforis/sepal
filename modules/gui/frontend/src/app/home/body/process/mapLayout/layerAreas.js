import _ from 'lodash'

export const validAreas = areas => {
    assertValidState(areas)
    const size = _.size(areas)
    if (size > 1) {
        return ['center', 'top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left', 'topLeft']
    }
    if (size > 0) {
        return ['center', 'top', 'right', 'bottom', 'left']
    }
    return ['center']
}

export const assignArea = ({areas, area, value}) => {
    assertValidState(areas)
    const newMask = maskByArea[area]
    const nextState = {[area]: value}
    Object.keys(areas)
        .map(area => ({value: areas[area], mask: maskByArea[area]}))
        .map(({value, mask}) => ({value, mask: updateMask(mask, newMask)}))
        .map(({value, mask}) => ({value, area: maskToArea(mask)}))
        .filter(({area}) => area)
        .forEach(({value, area}) => nextState[area] = value)
    return nextState
}

export const removeArea = ({areas, area}) => {
    const replacementMap = {
        top: areas => areas.bottom
            ? {center: areas.bottom}
            : {left: areas.bottomLeft, right: areas.bottomRight},
        bottom: areas => areas.top
            ? {center: areas.top}
            : {left: areas.topLeft, right: areas.topRight},
        left: areas => areas.right
            ? {center: areas.right}
            : {top: areas.topRight, bottom: areas.bottomRight},
        right: areas => areas.left
            ? {center: areas.left}
            : {top: areas.topLeft, bottom: areas.bottomLeft},
        topLeft: areas => areas.right
            ? {left: areas.bottomLeft}
            : {top: areas.topRight},
        topRight: areas => areas.left
            ? {right: areas.bottomRight}
            : {top: areas.topLeft},
        bottomLeft: areas => areas.right
            ? {left: areas.topLeft}
            : {bottom: areas.bottomRight},
        bottomRight: areas => areas.left
            ? {right: areas.topRight}
            : {bottom: areas.bottomLeft}
    }

    if (area === 'center') {
        return {}
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
    center: [
        [1, 1],
        [1, 1]
    ],
    top: [
        [1, 1],
        [0, 0]
    ],
    topRight: [
        [0, 1],
        [0, 0]
    ],
    right: [
        [0, 1],
        [0, 1]
    ],
    bottomRight: [
        [0, 0],
        [0, 1]
    ],
    bottom: [
        [0, 0],
        [1, 1],
    ],
    bottomLeft: [
        [0, 0],
        [1, 0],
    ],
    left: [
        [1, 0],
        [1, 0]
    ],
    topLeft: [
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
        throw Error('Invalid areas: ' + JSON.stringify(areas))
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
