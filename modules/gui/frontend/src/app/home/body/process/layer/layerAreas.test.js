import _ from 'lodash'
import {validAreas, nextAreas} from './layerAreas'

/* eslint-disable no-undef */

const test = name => {
    const nameTemplate = _.template(name)
    return ({
        assert: assertion => ({
            where: (...data) =>
                data.forEach(data =>
                    it(nameTemplate(data), () => assertion(data))
                )
        })
    })
}

const center = 'center'
const top = 'top'
const bottom = 'bottom'
const left = 'left'
const right = 'right'

test('validAreas(${JSON.stringify(areas)}) => ${result}')
    .assert(({areas, result}) => expect(validAreas(areas)).toEqual(result))
    .where(
        {
            areas: {top, bottom},
            result: ['center', 'top', 'topRight', 'right', 'bottomRight', 'bottom', 'bottomLeft', 'left', 'topLeft']
        },
        // {areas: {left, bottom}, result: []},
    )

test('nextState(${JSON.stringify(areas)}, area, id) => ${result}')
    .assert(({areas, id, area, result}) => expect(nextAreas({areas, area, id})).toEqual(result))
    .where(
        {areas: {center}, id: 'the id', area: 'center', result: {center: 'the id'}},
        {areas: {center}, id: 'the id', area: 'left', result: {left: 'the id', right: center}},
        {areas: {center}, id: 'the id', area: 'top', result: {top: 'the id', bottom: center}},
        {
            areas: {left, right},
            id: 'the id',
            area: 'top',
            result: {top: 'the id', bottomRight: right, bottomLeft: left}
        },
        {
            areas: {left, right},
            id: 'the id',
            area: 'bottomRight',
            result: {bottomRight: 'the id', left, topRight: right}
        },
    )
