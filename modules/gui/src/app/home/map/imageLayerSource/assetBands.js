// An asset's bands as a map layer draws them, from the Earth Engine metadata read of it. Each band's `data_type` is a
// PixelType, which states `dimensions` only for an array: a PixelType without it is a scalar. A band whose metadata
// states no PixelType, or dimensions that are no count, establishes nothing about its shape, and is not drawn.
export const assetAvailableBands = metadata =>
    Object.fromEntries((metadata?.bandNames || []).map(name => {
        const dataType = metadata.bands?.find(({id}) => id === name)?.data_type
        const arrayDimensions = arrayDimensionsOf(dataType)
        return [name, {dataType: {...dataType, ...(arrayDimensions !== undefined && {arrayDimensions})}}]
    }))

const arrayDimensionsOf = dataType => {
    if (dataType?.type !== 'PixelType') {
        return undefined
    }
    const {dimensions = 0} = dataType
    return Number.isInteger(dimensions) && dimensions >= 0 ? dimensions : undefined
}
