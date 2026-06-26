import ee from '#sepal/ee/ee'

export const toId = ({sample}) => {
    const geometry = sample.geometry()
    const scaleFactor = geometry.projection().nominalScale()
    const x = geometry.coordinates().getNumber(0).multiply(scaleFactor).round()
    const y = geometry.coordinates().getNumber(1).multiply(scaleFactor).round()
    return x.long().leftShift(32).add(y)
}

export const toColor = ({sample, allocationCollection}) =>
    allocationCollection
        .filter(ee.Filter.eq('stratum', sample.getNumber('stratum')))
        .first()
        .getString('color')
