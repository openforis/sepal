import {expect} from 'vitest'

import {updateCalculation} from './updateCalculation'

it('renaming image updates expression', () => {
    const renamedImage = {...image, prevName: 'i1', name: 'i1Renamed'}
    const calculation = toCalculation({
        expression: 'i1 +i1 - ii1 - i1_.i1 - i1[\'i1\'] - i12["i1"]',
        usedBands: [
            {id: 'id1', name: 'b1', imageId: 'some-image-id', imageName: 'i1'},
            {id: 'id2', name: 'b2', imageId: 'some-image-id', imageName: 'i1'}
        ]
    })
    expect(updateCalculation({
        changes: changes({renamedImages: [renamedImage]}),
        calculations: [calculation]
    })).toMatchObject([{
        ...calculation,
        usedBands: [
            {id: 'id1', name: 'b1', imageId: 'some-image-id', imageName: 'i1Renamed'},
            {id: 'id2', name: 'b2', imageId: 'some-image-id', imageName: 'i1Renamed'},
        ],
        expression: 'i1Renamed +i1Renamed - ii1 - i1_.i1 - i1Renamed[\'i1\'] - i12["i1"]'
    }])
})

it('renaming band updates expression', () => {
    const changedImage = {
        ...image,
        renamedBands: [{id: 'id1', prevName: 'b1', name: 'c1'}],
    }
    const calculation = toCalculation({
        expression: 'b1 + i1.b1 + i1.b11 - i1.bb1 - i2.b1 + i1[\'b1\'] + i1[\'b2\'] + i2[\'b1\'] + i2[\'b2\']',
        usedBands: [
            {id: 'id1', name: 'b1', imageId: 'some-image-id', imageName: 'i1'},
            {id: 'id2', name: 'b2', imageId: 'some-image-id', imageName: 'i1'}
        ]
    })
    expect(updateCalculation({
        changes: changes({imagesWithChangedBands: [changedImage]}),
        calculations: [calculation]
    })).toMatchObject([{
        ...calculation,
        usedBands: [
            {id: 'id1', name: 'c1', imageId: 'some-image-id', imageName: 'i1'},
            {id: 'id2', name: 'b2', imageId: 'some-image-id', imageName: 'i1'},
        ],
        expression: 'b1 + i1.c1 + i1.b11 - i1.bb1 - i2.b1 + i1[\'c1\'] + i1[\'b2\'] + i2[\'b1\'] + i2[\'b2\']'
    }])
})

it('renaming bands of every image it reads updates the expression for each', () => {
    const calculation = toCalculation({
        expression: 'c1.red + c2.red',
        usedBands: [
            {id: 'red1', name: 'red', imageId: 'calc-1', imageName: 'c1'},
            {id: 'red2', name: 'red', imageId: 'calc-2', imageName: 'c2'}
        ]
    })
    expect(updateCalculation({
        changes: changes({calculationsWithChangedBands: [
            {imageId: 'calc-1', name: 'c1', renamedBands: [{id: 'red1', prevName: 'red', name: 'veg'}]},
            {imageId: 'calc-2', name: 'c2', renamedBands: [{id: 'red2', prevName: 'red', name: 'veg'}]}
        ]}),
        calculations: [calculation]
    })).toMatchObject([{
        usedBands: [
            {id: 'red1', name: 'veg', imageId: 'calc-1', imageName: 'c1'},
            {id: 'red2', name: 'veg', imageId: 'calc-2', imageName: 'c2'}
        ],
        expression: 'c1.veg + c2.veg'
    }])
})

it('renaming bands of an image it reads updates the expression though an earlier image it reads only changed bands', () => {
    const calculation = toCalculation({
        expression: 'c1 + c2.red',
        usedBands: [
            {id: 'nir1', name: 'nir', imageId: 'calc-1', imageName: 'c1'},
            {id: 'red2', name: 'red', imageId: 'calc-2', imageName: 'c2'}
        ]
    })
    expect(updateCalculation({
        changes: changes({calculationsWithChangedBands: [
            {imageId: 'calc-1', name: 'c1', addedBands: [{id: 'swir1', name: 'swir'}], renamedBands: []},
            {imageId: 'calc-2', name: 'c2', renamedBands: [{id: 'red2', prevName: 'red', name: 'veg'}]}
        ]}),
        calculations: [calculation]
    })).toMatchObject([{expression: 'c1 + c2.veg'}])
})

it('renaming every image it reads updates the expression for each', () => {
    const calculation = toCalculation({
        expression: 'i1 + i2',
        usedBands: [
            {id: 'id1', name: 'b1', imageId: 'some-image-id', imageName: 'i1'},
            {id: 'red2', name: 'red', imageId: 'other-image-id', imageName: 'i2'}
        ]
    })
    expect(updateCalculation({
        changes: changes({renamedImages: [
            {...image, prevName: 'i1', name: 'first'},
            {imageId: 'other-image-id', prevName: 'i2', name: 'second'}
        ]}),
        calculations: [calculation]
    })).toMatchObject([{
        usedBands: [
            {id: 'id1', name: 'b1', imageId: 'some-image-id', imageName: 'first'},
            {id: 'red2', name: 'red', imageId: 'other-image-id', imageName: 'second'}
        ],
        expression: 'first + second'
    }])
})

const image = {imageId: 'some-image-id', name: 'i1', includedBands: [{id: 'id1', name: 'b1'}, {id: 'id2', name: 'b2'}]}
const toCalculation = toMerge => ({
    type: 'EXPRESSION',
    imageId: 'some-calculation-id',
    name: 'c1',
    usedBands: [],
    ...toMerge
})

const changes = toMerge => ({
    renamedImages: [],
    removedImages: [],
    addedCalculations: [],
    renamedCalculations: [],
    removedCalculations: [],
    imagesWithChangedBands: [],
    calculationsWithChangedBands: [],
    ...toMerge
})
