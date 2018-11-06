import _ from 'lodash'
import daysBetween from './daysBetween'

/* eslint-disable no-undef */

const test = (name) => {
    const nameTemplate = _.template(name)
    return ({
        assert: (assertion) => ({
            where: (...data) =>
                data.forEach(data =>
                    it(nameTemplate(data), () => assertion(data))
                )
        })
    })
}


test('daysBetween(${from}, ${to}) == ${result}')
    .assert(({from, to, result}) => expect(daysBetween(from, to)).toEqual(result))
    .where(
        {from: '2018-01-01', to: '2018-01-01', result: 0},
        {from: '2018-01-01', to: '2018-01-02', result: 1},
        {from: '2018-01-02', to: '2018-01-01', result: -1},
        {from: '2018-01-01', to: '2017-01-01', result: 0},
        {from: '2017-12-31', to: '2018-01-01', result: 1},
        {from: '2018-01-01', to: '2017-12-31', result: -1}
    )

