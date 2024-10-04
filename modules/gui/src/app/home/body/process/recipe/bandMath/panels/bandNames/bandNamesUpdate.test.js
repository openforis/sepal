import {toBandNames} from './bandNamesUpdate'

it('use band names when there are no prevBandNames', () => {
    expect(toBandNames(
        [
            {imageId: 'someImage', includedBands: [{id: 'id-1', band: 'name-1'}]}
        ],
        undefined
    )).toEqual(
        [
            {imageId: 'someImage', bands: [{id: 'id-1', originalName: 'name-1', outputName: 'name-1'}]}
        ]
    )
})

it('keep prevBandNames when id match', () => {
    expect(toBandNames(
        [
            {imageId: 'someImage', includedBands: [{id: 'id-1', band: 'name-1'}]}
        ],
        [
            {imageId: 'someImage', bands: [{id: 'id-1', originalName: 'name-1', outputName: 'prevName-1'}]}
        ]
    )).toEqual(
        [
            {imageId: 'someImage', bands: [{id: 'id-1', originalName: 'name-1', outputName: 'prevName-1'}]}
        ]
    )
})

it('can add band to existing image', () => {
    expect(toBandNames(
        [
            {imageId: 'someImage', includedBands: [{id: 'id-1', band: 'name-1'}, {id: 'id-2', band: 'name-2'}]}
        ],
        [
            {imageId: 'someImage', bands: [{id: 'id-1', originalName: 'name-1', outputName: 'prevName-1'}]}
        ]
    )).toEqual(
        [
            {imageId: 'someImage', bands: [
                {id: 'id-1', originalName: 'name-1', outputName: 'prevName-1'},
                {id: 'id-2', originalName: 'name-2', outputName: 'name-2'}]
            }
        ]
    )
})

it('can add image', () => {
    expect(toBandNames(
        [
            {imageId: 'someImage', includedBands: [{id: 'id-1', band: 'name-1'}]},
            {imageId: 'someImage2', includedBands: [{id: 'id-2', band: 'name-2'}]},
        ],
        [
            {imageId: 'someImage', bands: [{id: 'id-1', originalName: 'name-1', outputName: 'prevName-1'}]}
        ]
    )).toEqual(
        [
            {imageId: 'someImage', bands: [{id: 'id-1', originalName: 'name-1', outputName: 'prevName-1'}]},
            {imageId: 'someImage2', bands: [{id: 'id-2', originalName: 'name-2', outputName: 'name-2'}]},
        ]
    )
})

it('can remove band', () => {
    expect(toBandNames(
        [
            {imageId: 'someImage', includedBands: [{id: 'id-1', band: 'name-1'}]}
        ],
        [
            {imageId: 'someImage', bands: [
                {id: 'id-1', originalName: 'name-1', outputName: 'name-1'},
                {id: 'id-2', originalName: 'name-2', outputName: 'name-2'}]
            }
        ]
    )).toEqual(
        [
            {imageId: 'someImage', bands: [{id: 'id-1', originalName: 'name-1', outputName: 'name-1'}]}
        ]
    )
})

it('can remove image', () => {
    expect(toBandNames(
        [
            {imageId: 'someImage', includedBands: [{id: 'id-1', band: 'name-1'}]}
        ],
        [
            {imageId: 'someImage', bands: [{id: 'id-1', originalName: 'name-1', outputName: 'name-1'}]},
            {imageId: 'someImage2', bands: [{id: 'id-2', originalName: 'name-2', outputName: 'name-2'}]},
        ]
    )).toEqual(
        [
            {imageId: 'someImage', bands: [{id: 'id-1', originalName: 'name-1', outputName: 'name-1'}]}
        ]
    )
})

it('provides unique band names', () => {
    expect(toBandNames(
        [
            {imageId: 'someImage', includedBands: [{id: 'id-1', band: 'name-1'}]},
            {imageId: 'someImage2', includedBands: [{id: 'id-2', band: 'name-1'}]},
            {imageId: 'someImage3', includedBands: [{id: 'id-3', band: 'name-1'}]},
        ],
        undefined
    )).toEqual(
        [
            {imageId: 'someImage', bands: [{id: 'id-1', originalName: 'name-1', outputName: 'name-1'}]},
            {imageId: 'someImage2', bands: [{id: 'id-2', originalName: 'name-1', outputName: 'name-1_1'}]},
            {imageId: 'someImage3', bands: [{id: 'id-3', originalName: 'name-1', outputName: 'name-1_2'}]},
        ]
    )
})

it('update prev output band name when duplicate is introduced', () => {
    expect(toBandNames(
        [
            {imageId: 'someImage', includedBands: [
                {id: 'id-1', band: 'name-1'},
                {id: 'id-3', band: 'name-to-generate-duplicate'}
            ]},
            {imageId: 'someImage2', includedBands: [{id: 'id-2', band: 'name-2'}]}
        ],
        [
            {imageId: 'someImage', bands: [{id: 'id-1', originalName: 'name-1', outputName: 'name-1'}]},
            {imageId: 'someImage2', bands: [{id: 'id-2', originalName: 'name-2', outputName: 'name-to-generate-duplicate'}]},
        ]
    )).toEqual(
        [
            {imageId: 'someImage', bands: [
                {id: 'id-1', originalName: 'name-1', outputName: 'name-1'},
                {id: 'id-3', originalName: 'name-to-generate-duplicate', outputName: 'name-to-generate-duplicate'}
            ]},
            {imageId: 'someImage2', bands: [
                {id: 'id-2', originalName: 'name-2', outputName: 'name-to-generate-duplicate_1'}
            ]}
        ]
    )
})
