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
