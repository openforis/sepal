import _ from 'lodash'

export const validAreas = areas => {
    assertValidState(areas)
    return Object.keys(areas).length === 1
        ? ['center', 'top', 'right', 'bottom', 'left']
        : ['center', 'top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left', 'topLeft']
}

export const assignAreas = ({areas, area, id}) => {
    assertValidState(areas)
    const newMask = maskByArea[area]
    const nextState = {[area]: id}
    Object.keys(areas)
        .map(area => ({id: areas[area], mask: maskByArea[area]}))
        .map(({id, mask}) => ({id, mask: updateMask(mask, newMask)}))
        .map(({id, mask}) => ({id, area: maskToArea(mask)}))
        .filter(({area}) => area)
        .forEach(({id, area}) => nextState[area] = id)
    return nextState
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
        .every(value => value === 1)
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
