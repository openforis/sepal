import {findChanges} from './findChanges'
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

it('adding calculation when one already exists results in two images with unique output names', () => {
    const calculation2 = {...calculation, imageId: 'another-calculation-id'}
    const outputBands = [{id: 'id1', defaultOutputName: 'b1', name: 'b1'}]
    const outputBands2 = [{id: 'id1', defaultOutputName: 'b1_1', name: 'b1'}]
    expect(updateOutputBands({
        changes: changes({addedCalculations: [calculation2]}),
        outputImages: [{...calculation, outputBands}]
    })).toMatchObject([
        {...calculation, outputBands},
        {...calculation2, outputBands: outputBands2},
    ])
})

// An input's bands deliberately unselected, as its panel applies the edit and the sync follows it. Saved recipes can
// hold a pass-through output copied under an id other than its input band's.
describe('deliberately removing an input band', () => {
    it('removes its pass-through output, copied under another id', () => {
        const red = band('red-id', 'red')
        const nir = band('nir-id', 'nir')
        const prevImages = [input('i1', [red, nir])]
        const images = [input('i1', [nir])]
        const outputImages = [output('i1', [{...copied(red, 'legacy-red-id'), outputName: 'my_red'}, copied(nir)])]

        const updated = updateOutputBands({changes: findChanges({prevImages, images, prevCalculations: [], calculations: []}), outputImages})

        expect(outputNames(updated)).toEqual({i1: ['nir']})
    })

    it('leaves a band of the same name output from another image', () => {
        const red = band('red-id', 'red')
        const otherRed = band('other-red-id', 'red')
        const prevImages = [input('i1', [red]), input('i2', [otherRed])]
        const images = [input('i1', []), input('i2', [otherRed])]
        const outputImages = [output('i1', [copied(red, 'legacy-red-id')]), output('i2', [copied(otherRed, 'legacy-other-red-id')])]

        const updated = updateOutputBands({changes: findChanges({prevImages, images, prevCalculations: [], calculations: []}), outputImages})

        expect(outputNames(updated)).toEqual({i1: [], i2: ['red']})
    })

    it('matches the band an output was copied from, not the name it is output under', () => {
        const red = band('red-id', 'red')
        const nir = band('nir-id', 'nir')
        const prevImages = [input('i1', [red, nir])]
        const images = [input('i1', [nir])]
        const nirOutputAsRed = {...copied(nir, 'legacy-nir-id'), defaultOutputName: 'red', outputName: 'red'}
        const outputImages = [output('i1', [nirOutputAsRed])]

        const updated = updateOutputBands({changes: findChanges({prevImages, images, prevCalculations: [], calculations: []}), outputImages})

        expect(updated[0].outputBands).toEqual([nirOutputAsRed])
    })

    it('removes every output of the band, the one copied under its id and one copied under a legacy id alike', () => {
        const vv = band('vv-id', 'VV')
        const vh = band('vh-id', 'VH')
        const ratio = band('ratio-id', 'ratio_VV_VH')
        const prevImages = [input('i1', [vv, vh, ratio])]
        const images = [input('i1', [vv, vh])]
        const outputImages = [output('i1', [
            copied(vv), copied(ratio, 'legacy-ratio-id'), {...copied(vh), outputName: 'cross'}, {...copied(ratio), defaultOutputName: 'ratio_VV_VH_1'}
        ])]

        const updated = updateOutputBands({changes: findChanges({prevImages, images, prevCalculations: [], calculations: []}), outputImages})

        expect(updated[0].outputBands).toEqual([copied(vv), {...copied(vh), outputName: 'cross'}])
    })

    it('keeps the replacement where a band is removed and another of its name added in one edit', () => {
        const red = band('red-id', 'red')
        const replacement = band('replacement-id', 'red')
        const prevImages = [input('i1', [red])]
        const images = [input('i1', [replacement])]
        const outputImages = [output('i1', [copied(red, 'legacy-red-id')])]

        const updated = updateOutputBands({changes: findChanges({prevImages, images, prevCalculations: [], calculations: []}), outputImages})

        expect(updated[0].outputBands.map(({id}) => id)).toEqual([replacement.id])
    })
})

const band = (id, name) => ({id, name})
const input = (imageId, includedBands) => ({imageId, name: imageId, includedBands})
const copied = (source, id = source.id) => ({...source, id, defaultOutputName: source.name})
const output = (imageId, outputBands) => ({imageId, outputBands})
const outputNames = outputImages =>
    Object.fromEntries(outputImages.map(({imageId, outputBands}) => [imageId, outputBands.map(({name}) => name)]))

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
    imagesWithChangedBands: [],
    ...toMerge
})
