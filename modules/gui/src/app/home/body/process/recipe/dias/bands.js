import {msg} from '~/translate'

const typeInt = {precision: 'int'}
const typeFloat = {precision: 'float'}

// Which bands a configured recipe has is its declaration's to say; this is how they are shown.
export const bandPresentation = () => ({
    first_sensor: {dataType: typeInt, label: bandLabel('first_sensor')},
    first_date: {dataType: typeFloat, label: bandLabel('first_date')},
    confirming_sensor: {dataType: typeInt, label: bandLabel('confirming_sensor')},
    confirming_date: {dataType: typeFloat, label: bandLabel('confirming_date')},
    forest_mask: {dataType: typeInt, label: bandLabel('forest_mask')}
})

// The groups Retrieve offers the bands in.
export const groupedBandPresentation = () => {
    const presentation = bandPresentation()
    const toOption = band => ({value: band, ...presentation[band]})
    return [
        ['first_sensor', 'first_date'].map(toOption),
        ['confirming_sensor', 'confirming_date'].map(toOption),
        ['forest_mask'].map(toOption)
    ]
}

export const bandLabel = band => msg(['process.dias.bands', band])
