// What /bands answers (modules/gee/src/jobs/ee/image/bands.js) for an image with these bands - names, or {name,
// arrayDimensions} - and, for an asset, the properties it records, as the request's flags ask: the bands' names alone;
// with data types, the bands typed; and for an asset asked for its properties, {bands, properties}, the bands typed.
// When and whether a test answers stays the test's.
export const bandsAnswer = ({bands, properties = {}}) => ({asset, includeDataTypes, includeProperties}) => {
    const typed = bands.map(band => typeof band === 'string' ? {name: band, arrayDimensions: 0} : band)
    if (asset && includeProperties) {
        return {bands: typed, properties}
    }
    return includeDataTypes ? typed : typed.map(({name}) => name)
}
