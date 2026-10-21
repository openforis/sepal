const typeInt = {precision: 'int'}

// Which bands a configured recipe has is its declaration's to say; this is how they are shown.
export const bandPresentation = () => ({
    first_sensor: {dataType: typeInt},
    first_ydoy: {dataType: typeInt},
    confirming_sensor: {dataType: typeInt},
    confirming_ydoy: {dataType: typeInt},
    forest_mask: {dataType: typeInt}
})

// The groups Retrieve offers the bands in.
export const groupedBandPresentation = () => {
    const presentation = bandPresentation()
    const toOption = band => ({value: band, label: band, ...presentation[band]})
    return [
        ['first_sensor', 'first_ydoy'].map(toOption),
        ['confirming_sensor', 'confirming_ydoy'].map(toOption),
        ['forest_mask'].map(toOption)
    ]
}
