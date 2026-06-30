import ee from '#sepal/ee/ee'

export const toId = ({sample}) => {
    const geometry = sample.geometry()
    const scaleFactor = geometry.projection().nominalScale()
    const x = geometry.coordinates().getNumber(0).multiply(scaleFactor).round()
    const y = geometry.coordinates().getNumber(1).multiply(scaleFactor).round()
    // Format server-side as an integer string: the packed id exceeds 2^53, so a numeric id would render
    // in scientific notation and lose precision when opened as CSV in a spreadsheet.
    return x.long().leftShift(32).add(y).format('%d')
}

export const toColor = ({sample, allocationCollection}) =>
    allocationCollection
        .filter(ee.Filter.eq('stratum', sample.getNumber('stratum')))
        .first()
        .getString('color')
