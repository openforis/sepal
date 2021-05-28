import {formatCoordinates, parseCoordinates} from './coords'
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

test('coords.parse(\'${params.query}\') === ${JSON.stringify(result)}')
    .assert(({params, result}) => expect(parseCoordinates(params.query)).toEqual(result))
    .where(
        // incomplete
        {params: {query: '12.34'}, result: []},

        // case
        {params: {query: '10 n 20 e'}, result: [{lat: 10, lng: 20}]},
        {params: {query: '10 N 20 E'}, result: [{lat: 10, lng: 20}]},
        
        // sign or direction, not both
        {params: {query: '+10 N 20 E'}, result: []},

        // zero
        {params: {query: '0 S 0 W'}, result: [{lat: 0, lng: 0}]},
        {params: {query: '+0 +0'}, result: [{lat: 0, lng: 0}]},
        {params: {query: '-0 -0'}, result: [{lat: 0, lng: 0}]},

        // separators (combination of optional comma and spaces)
        {params: {query: '10 N 20 E'}, result: [{lat: 10, lng: 20}]},
        {params: {query: '10 N, 20 E'}, result: [{lat: 10, lng: 20}]},
        {params: {query: '    10 N, 20 E'}, result: [{lat: 10, lng: 20}]},
        {params: {query: '10 N, 20 E    '}, result: [{lat: 10, lng: 20}]},
        {params: {query: '    10 N, 20 E    '}, result: [{lat: 10, lng: 20}]},
        {params: {query: '10 N   ,    20 E'}, result: [{lat: 10, lng: 20}]},
        {params: {query: '   10      N     20      E  '}, result: [{lat: 10, lng: 20}]},

        // non-ambiguous (lat, lon)
        {params: {query: '12.34 123.45'}, result: [{lat: 12.34, lng: 123.45}]},
        {params: {query: '12.34 -123.45'}, result: [{lat: 12.34, lng: -123.45}]},
        {params: {query: '12.34 N 123.45 W'}, result: [{lat: 12.34, lng: -123.45}]},
        {params: {query: '12.34 S 123.45 E'}, result: [{lat: -12.34, lng: 123.45}]},
        {params: {query: '12.34 N, 23.45'}, result: [{lat: 12.34, lng: 23.45}]},
        {params: {query: '12.34, 23.45 E'}, result: [{lat: 12.34, lng: 23.45}]},

        // non-ambiguous (lon, lat)
        {params: {query: '12.34, 23.45 S'}, result: [{lat: -23.45, lng: 12.34}]},
        {params: {query: '12.34 E, 23.45'}, result: [{lat: 23.45, lng: 12.34}]},
        {params: {query: '112.34, 23.45'}, result: [{lat: 23.45, lng: 112.34}]},
        {params: {query: '-112.34, -23.45'}, result: [{lat: -23.45, lng: -112.34}]},

        // non-ambiguous (symmetrical)
        {params: {query: '56.78, 56.78'}, result: [{lat: 56.78, lng: 56.78}]},
        {params: {query: '-56.78, -56.78'}, result: [{lat: -56.78, lng: -56.78}]},

        // conflicting
        {params: {query: '12.34 N 23.45 S'}, result: []},
        {params: {query: '12.34 E 23.45 W'}, result: []},

        // overspecified
        {params: {query: '-12.34 S 123.45 W'}, result: []},
        {params: {query: '12.34 S -123.45 W'}, result: []},

        // out of range
        {params: {query: '12.34 223.45'}, result: []},
        {params: {query: '112.34 23.45 E'}, result: []},
        {params: {query: '112.34 223.45 E'}, result: []},

        // multiple results
        {params: {query: '12.34, 23.45'}, result: [{lat: 12.34, lng: 23.45}, {lat: 23.45, lng: 12.34}]},
        {params: {query: '23.45, 12.34'}, result: [{lat: 23.45, lng: 12.34}, {lat: 12.34, lng: 23.45}]},
    )

test('coords.formatCoordinates(${JSON.stringify(params.coords)}) === ${JSON.stringify(result)}')
    .assert(({params, result}) => expect(formatCoordinates(params.coords)).toEqual(result))
    .where(
        {params: {coords: {lat: 10, lng: 20}}, result: '10 N, 20 E'},
    )