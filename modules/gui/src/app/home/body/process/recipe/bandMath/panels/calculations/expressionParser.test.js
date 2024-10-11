import {determineUsedBands, InvalidBandName, InvalidImageName} from './expressionParser'

it('given reference to image, all included image bands are returned', () => {
    const image = {imageId: 'some-image-id', name: 'i1', includedBands: [{name: 'blue'}]}
    expect(
        determineUsedBands({
            expression: 'i1',
            images: [image],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image.includedBands[0],
                imageId: image.imageId,
                imageName: image.name
            }
        ]
    )
})

it('given multiple references to image, unique band names are returned', () => {
    const image = {imageId: 'some-image-id', name: 'i1', includedBands: [{name: 'blue'}]}
    expect(
        determineUsedBands({
            expression: 'i1 + i1',
            images: [image],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image.includedBands[0],
                imageId: image.imageId,
                imageName: image.name
            }
        ]
    )
})

it('given two images with same band name, both bands are returned', () => {
    const image1 = {imageId: 'some-image-id1', name: 'i1', includedBands: [{name: 'blue'}]}
    const image2 = {imageId: 'some-image-id2', name: 'i2', includedBands: [{name: 'blue'}]}
    expect(
        determineUsedBands({
            expression: 'i1 + i2',
            images: [image1, image2],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image1.includedBands[0],
                imageId: image1.imageId,
                imageName: image1.name
            },
            {
                ...image2.includedBands[0],
                imageId: image2.imageId,
                imageName: image2.name
            }
        ]
    )
})

it('given reference to calculation, all included image bands are returned', () => {
    const calculation = {imageId: 'some-image-id', name: 'c1', includedBands: [{name: 'blue'}]}
    expect(
        determineUsedBands({
            expression: 'c1',
            images: [],
            calculations: [calculation]
        })
    ).toEqual(
        [
            {
                ...calculation.includedBands[0],
                imageId: calculation.imageId,
                imageName: calculation.name
            }
        ]
    )
})

it('given reference to image band, all included image bands are returned', () => {
    const image = {imageId: 'some-image-id', name: 'i1', includedBands: [{name: 'blue'}]}
    expect(
        determineUsedBands({
            expression: 'i1.blue',
            images: [image],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image.includedBands[0],
                imageId: image.imageId,
                imageName: image.name
            }
        ]
    )
})

it('given reference to image band using brackets, all included image bands are returned', () => {
    const image = {imageId: 'some-image-id', name: 'i1', includedBands: [{name: 'blue'}]}
    expect(
        determineUsedBands({
            expression: 'i1["blue"]',
            images: [image],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image.includedBands[0],
                imageId: image.imageId,
                imageName: image.name
            }
        ]
    )
})

it('given sum of two images, bands of both images are returned', () => {
    const image1 = {imageId: 'some-image-id1', name: 'i1', includedBands: [{name: 'blue'}]}
    const image2 = {imageId: 'some-image-id2', name: 'i2', includedBands: [{name: 'green'}]}
    expect(
        determineUsedBands({
            expression: 'i1 + i2',
            images: [image1, image2],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image1.includedBands[0],
                imageId: image1.imageId,
                imageName: image1.name
            },
            {
                ...image2.includedBands[0],
                imageId: image2.imageId,
                imageName: image2.name
            },
        ]
    )
})

it('given sum of two image bands, bands of both images are returned', () => {
    const image = {imageId: 'some-image-id1', name: 'i1', includedBands: [{name: 'blue'}, {name: 'green'}]}
    expect(
        determineUsedBands({
            expression: 'i1.blue + i1.green',
            images: [image],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image.includedBands[0],
                imageId: image.imageId,
                imageName: image.name
            },
            {
                ...image.includedBands[1],
                imageId: image.imageId,
                imageName: image.name
            },
        ]
    )
})

it('given sum of two image bands, bands of both images are returned', () => {
    const image = {imageId: 'some-image-id1', name: 'i1', includedBands: [{name: 'blue'}, {name: 'green'}]}
    expect(
        determineUsedBands({
            expression: 'i1.blue + i1.green',
            images: [image],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image.includedBands[0],
                imageId: image.imageId,
                imageName: image.name
            },
            {
                ...image.includedBands[1],
                imageId: image.imageId,
                imageName: image.name
            },
        ]
    )
})

it('given a unary operation on an image, the image bands are returned', () => {
    const image = {imageId: 'some-image-id1', name: 'i1', includedBands: [{name: 'blue'}, {name: 'green'}]}
    expect(
        determineUsedBands({
            expression: '!i1',
            images: [image],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image.includedBands[0],
                imageId: image.imageId,
                imageName: image.name
            },
            {
                ...image.includedBands[1],
                imageId: image.imageId,
                imageName: image.name
            },
        ]
    )
})

it('given expression with literal, bands are returned', () => {
    const image = {imageId: 'some-image-id', name: 'i1', includedBands: [{name: 'blue'}]}
    expect(
        determineUsedBands({
            expression: 'i1 + 1',
            images: [image],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image.includedBands[0],
                imageId: image.imageId,
                imageName: image.name
            }
        ]
    )
})

it('given conditional expression, bands are returned', () => {
    const image1 = {imageId: 'some-image-id1', name: 'i1', includedBands: [{name: 'blue'}]}
    const image2 = {imageId: 'some-image-id2', name: 'i2', includedBands: [{name: 'green'}]}
    expect(
        determineUsedBands({
            expression: 'i1 > 4 ? i2 : 4',
            images: [image1, image2],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image1.includedBands[0],
                imageId: image1.imageId,
                imageName: image1.name
            },
            {
                ...image2.includedBands[0],
                imageId: image2.imageId,
                imageName: image2.name
            },
        ]
    )
})

it('given a function call, bands in arguments are returned', () => {
    const image = {imageId: 'some-image-id', name: 'i1', includedBands: [{name: 'blue'}]}
    expect(
        determineUsedBands({
            expression: 'sin(i1)',
            images: [image],
            calculations: []
        })
    ).toEqual(
        [
            {
                ...image.includedBands[0],
                imageId: image.imageId,
                imageName: image.name
            }
        ]
    )
})

it('given expression with non-existing image, an InvalidImageName is thrown', () => {
    expect(() =>
        determineUsedBands({
            expression: 'i1',
            images: [],
            calculations: []
        })
    ).toThrowError(InvalidImageName)
})

it('given expression using non-existing band, an InvalidBandName is thrown', () => {
    expect(() =>
        determineUsedBands({
            expression: 'i1.nonExisting',
            images: [{imageId: 'some-image-id', name: 'i1', includedBands: [{name: 'blue'}]}],
            calculations: []
        })
    ).toThrowError(InvalidBandName)
})

it('given malformed expression, an Error is thrown', () => {
    expect(() =>
        determineUsedBands({
            expression: '(',
            images: [],
            calculations: []
        })
    ).toThrowError(Error)
})

it('given expression with string literal, error is thrown', () => {
    const image = {imageId: 'some-image-id', name: 'i1', includedBands: [{name: 'blue'}]}
    expect(() =>
        determineUsedBands({
            expression: 'i1 + "someString"',
            images: [image],
            calculations: []
        })
    ).toThrowError(Error)
})
