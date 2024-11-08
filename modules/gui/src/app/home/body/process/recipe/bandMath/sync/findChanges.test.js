import {findChanges} from './findChanges'

it('no images/calculations gives no changes', () => {
    expect(findChanges(emptyInput))
        .toEqual(emptyChange)
})

it('removed image is detected', () => {
    expect(findChanges({...emptyInput,
        prevImages: [image]
    })).toEqual({...emptyChange,
        removedImages: [image]
    })
})

it('added calculation is detected', () => {
    expect(findChanges({...emptyInput,
        calculations: [calculation]
    })).toEqual({...emptyChange,
        addedCalculations: [calculation]
    })
})

it('removed calculation is detected', () => {
    expect(findChanges({...emptyInput,
        prevCalculations: [calculation]
    })).toEqual({...emptyChange,
        removedCalculations: [calculation]
    })
})

it('renamed image is detected', () => {
    const prevImage = {...image, name: 'prevI1'}
    expect(findChanges({...emptyInput,
        prevImages: [prevImage],
        images: [image]
    })).toEqual({...emptyChange,
        renamedImages: [{...image, prevName: prevImage.name}]
    })
})

it('renamed calculation is detected', () => {
    const prevCalculation = {...calculation, name: 'prevC1'}
    expect(findChanges({...emptyInput,
        prevCalculations: [prevCalculation],
        calculations: [calculation]
    })).toEqual({...emptyChange,
        renamedCalculations: [{...calculation, prevName: prevCalculation.name}]
    })
})

it('removed image band is detected', () => {
    const prevImage = {...image, includedBands: [{}]}
    const imageWithRemovedBand = {...image, includedBands: []}
    expect(findChanges({...emptyInput,
        prevImages: [prevImage],
        images: [imageWithRemovedBand]
    })).toEqual({...emptyChange,
        imagesWithChangedBands: [{...imageWithRemovedBand, ...emptyBandChange,
            removedBands: prevImage.includedBands
        }]
    })
})

it('added calculation band is detected', () => {
    const prevCalculation = {...calculation, includedBands: []}
    expect(findChanges({...emptyInput,
        prevCalculations: [prevCalculation],
        calculations: [calculation]
    })).toEqual({...emptyChange,
        calculationsWithChangedBands: [{...calculation, ...emptyBandChange,
            addedBands: calculation.includedBands
        }]
    })
})

it('renamed calculation band is detected', () => {
    const prevCalculation = {...calculation,
        includedBands: [{...calculation.includedBands[0], name: 'prevB1'}]}
    expect(findChanges({...emptyInput,
        prevCalculations: [prevCalculation],
        calculations: [calculation]
    })).toEqual({...emptyChange,
        calculationsWithChangedBands: [{...calculation, ...emptyBandChange,
            renamedBands: [{...calculation.includedBands[0], prevName: 'prevB1'}]
        }]
    })
})

const image = {
    imageId: 'some-image-id',
    name: 'i1',
    includedBands: [{id: 'some-image-band-id', name: 'b1'}]
}
const calculation = {
    imageId: 'some-calculation-id',
    name: 'c1',
    includedBands: [{id: 'some-calculation-band-id', name: 'b1'}]
}

const emptyInput = {
    prevImages: [],
    images: [],
    prevCalculations: [],
    calculations: []
}

const emptyBandChange = {
    addedBands: [],
    removedBands: [],
    renamedBands: []
}

const emptyChange = {
    removedImages: [],
    renamedImages: [],
    addedCalculations: [],
    removedCalculations: [],
    renamedCalculations: [],
    imagesWithChangedBands: [],
    calculationsWithChangedBands: [],
}

