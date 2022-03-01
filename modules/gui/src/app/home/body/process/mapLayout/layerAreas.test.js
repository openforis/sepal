import {assignArea, validAreas} from './layerAreas'
import _ from 'lodash'

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

test('assignArea(${JSON.stringify(areas)}, area, value) => ${result}')
    .assert(({areas, area, value, result}) => expect(assignArea({areas, area, value})).toEqual(result))
    .where(
        {areas: {center}, value: 'value', area: 'center', result: {center: 'value'}},
        {areas: {center}, value: 'value', area: 'left', result: {left: 'value', right: center}},
        {areas: {center}, value: 'value', area: 'top', result: {top: 'value', bottom: center}},
        {
            areas: {left, right},
            value: 'value',
            area: 'top',
            result: {top: 'value', bottomRight: right, bottomLeft: left}
        },
        {
            areas: {left, right},
            value: 'value',
            area: 'bottomRight',
            result: {bottomRight: 'value', left, topRight: right}
        },
    )
