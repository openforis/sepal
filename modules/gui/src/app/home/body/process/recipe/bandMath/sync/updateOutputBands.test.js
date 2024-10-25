import {updateOutputBands} from './updateOutputBands'

it('removing calculations when no outputs returns []', () => {
    expect(updateOutputBands({
        changes: changes({removedCalculations: [calculation]}),
        outputImages: noOutputImages
    })).toMatchObject([])
})

it('removing calculations removes it from output images', () => {
    expect(updateOutputBands({
        changes: changes({removedCalculations: [calculation]}),
        outputImages: [calculation]
    })).toMatchObject([])
})

it('removing calculations keeps other calculations', () => {
    const otherCalculation = {...calculation, imageId: 'other-calculation-id'}
    expect(updateOutputBands({
        changes: changes({removedCalculations: [calculation]}),
        outputImages: [calculation, otherCalculation]
    })).toMatchObject([otherCalculation])
})

it('adding single-band calculation adds it and its band to outputs', () => {
    expect(updateOutputBands({
        changes: changes({addedCalculations: [calculation]}),
        outputImages: []
    })).toMatchObject([{
        ...calculation,
        outputBands: [{id: 'id1', defaultOutputName: 'b1', name: 'b1'}]
    }])
})

it('adding multi-band calculation adds it and all its bands to theoutputs', () => {
    const multiBandCalculation = {
        imageId: 'some-calculation-id',
        includedBands: [{id: 'id1', name: 'b1'}, {id: 'id2', name: 'b2'}]}
    expect(updateOutputBands({
        changes: changes({addedCalculations: [multiBandCalculation]}),
        outputImages: []
    })).toMatchObject([{
        ...multiBandCalculation,
        outputBands: [
            {id: 'id1', defaultOutputName: 'b1', name: 'b1'},
            {id: 'id2', defaultOutputName: 'b2', name: 'b2'}
        ]
    }])
})

it('removing image removes it from output', () => {
    expect(updateOutputBands({
        changes: changes({removedImages: [image]}),
        outputImages: [image]
    })).toMatchObject([])
})

it('adding calculation band adds it to output', () => {
    const updatedBand = {...image, includedBands: [{name: 'b1'}, {name: 'b2'}]}
    expect(updateOutputBands({
        changes: changes({
            calculationsWithChangedBands: [{...updatedBand, addedBands: [{name: 'b2'}]}]
        }),
        outputImages: [{...image, outputBands: [{defaultOutputName: 'b1', name: 'b1'}]}]
    })).toMatchObject([{...updatedBand, outputBands: [
        {defaultOutputName: 'b1', name: 'b1'},
        {defaultOutputName: 'b2', name: 'b2'}
    ]}])
})

it('removing calculation band removes it from output', () => {
    const updatedBand = {...image, includedBands: [{id: 'id1', name: 'b1'}]}
    expect(updateOutputBands({
        changes: changes({
            calculationsWithChangedBands: [{...updatedBand, removedBands: [{id: 'id2', name: 'b2'}]}]
        }),
        outputImages: [{
            ...image,
            outputBands: [
                {id: 'id1', defaultOutputName: 'b1', name: 'b1'},
                {id: 'id2', defaultOutputName: 'b2', name: 'b2'}
            ]
        }]
    })).toMatchObject([{...updatedBand, outputBands: [
        {id: 'id1', defaultOutputName: 'b1', name: 'b1'}
    ]}])
})

it('rename calculation band renames it in output', () => {
    const updatedBand = {...image, includedBands: [{id: 'id1', name: 'renamed-b1'}]}
    expect(updateOutputBands({
        changes: changes({
            calculationsWithChangedBands: [{...updatedBand, renamedBands: [{id: 'id1', name: 'renamed-b1'}]}]
        }),
        outputImages: [{
            ...image,
            outputBands: [
                {id: 'id1', defaultOutputName: 'b1', outputName: 'manually-set-b1', name: 'b1'},
            ]
        }]
    })).toMatchObject([{...updatedBand, outputBands: [
        {id: 'id1', defaultOutputName: 'renamed-b1', outputName: 'manually-set-b1', name: 'renamed-b1'}
    ]}])
})

const image = {imageId: 'some-image-id', includedBands: [{id: 'id1', name: 'b1'}]}
const calculation = {imageId: 'some-calculation-id', includedBands: [{id: 'id1', name: 'b1'}]}
const noOutputImages = []

const changes = toMerge => ({
    renamedImages: [],
    removedImages: [],
    addedCalculations: [],
    renamedCalculations: [],
    removedCalculations: [],
    calculationsWithChangedBands: [],
    ...toMerge
})
