export const VALID_SELECTION = 'VALID'
export const EMPTY_SELECTION = 'EMPTY'
export const INVALID_SELECTION = 'INVALID'

const allDestinations = value => ({
    GEE: value,
    DRIVE: value,
    SEPAL: value
})

const isVerifiedDimension = ({dataType} = {}) =>
    Number.isInteger(dataType?.arrayDimensions) && dataType.arrayDimensions >= 0

// Physical destination compatibility answers only whether the selected band schema can be represented by a
// destination. In particular, GEE compatibility does not prove that pyramiding-policy authority is complete;
// task construction owns that separate validation.
//
// The selected bands are always named: "all bands" names every available band, ignoring a manual selection
// retained beside it, and an explicitly empty manual selection names none. A caller that states neither -
// `useAllBands` absent and no manual selection - predates the option and means all bands.
export const physicalDestinationCompatibility = ({bands, selectedBandNames, useAllBands}) => {
    const outputBands = Array.isArray(bands) ? bands : []
    const manualSelection = Array.isArray(selectedBandNames) ? selectedBandNames : []

    if (useAllBands === false && manualSelection.length === 0) {
        const hasScalar = outputBands.some(band =>
            isVerifiedDimension(band) && band.dataType.arrayDimensions === 0
        )
        const onlyArrays = outputBands.length > 0 && outputBands.every(band =>
            isVerifiedDimension(band) && band.dataType.arrayDimensions > 0
        )
        return {
            selectionStatus: EMPTY_SELECTION,
            selectedBands: [],
            missingBandNames: [],
            destinations: onlyArrays
                ? {GEE: true, DRIVE: false, SEPAL: false}
                : hasScalar
                    ? allDestinations(true)
                    : allDestinations(false)
        }
    }

    const selection = useAllBands === true || manualSelection.length === 0
        ? outputBands.map(({name}) => name)
        : manualSelection
    const outputByName = new Map(outputBands.map(band => [band.name, band]))
    const selectedBands = selection.map(name => outputByName.get(name))
    const missingBandNames = selection.filter(name => !outputByName.has(name))

    if (!selectedBands.length || selectedBands.some(band => !band || !isVerifiedDimension(band))) {
        return {
            selectionStatus: INVALID_SELECTION,
            selectedBands: [],
            missingBandNames,
            destinations: allDestinations(false)
        }
    }

    const scalarOnly = selectedBands.every(({dataType}) => dataType.arrayDimensions === 0)
    return {
        selectionStatus: VALID_SELECTION,
        selectedBands,
        missingBandNames: [],
        destinations: {
            GEE: true,
            DRIVE: scalarOnly,
            SEPAL: scalarOnly
        }
    }
}
