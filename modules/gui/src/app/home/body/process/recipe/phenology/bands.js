const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

// Which bands a configured recipe has is its declaration's to say; this is how they are shown.
export const bandPresentation = () =>
    Object.fromEntries(bandGroups.flat().map(band => [band, {label: band, dataType: dataTypes[band]}]))

export const groupedBandPresentation = () => {
    const presentation = bandPresentation()
    return bandGroups.map(bands => bands.map(band => ({value: band, ...presentation[band]})))
}

const bandGroups = [
    ['background', 'amplitude', 'median'],
    ['dayOfYear_1', 'days_1', 'median_1', 'slope_1', 'offset_1'],
    ['dayOfYear_2', 'days_2', 'median_2', 'slope_2', 'offset_2'],
    ['dayOfYear_3', 'days_3', 'median_3', 'slope_3', 'offset_3'],
    ['dayOfYear_4', 'days_4', 'median_4', 'slope_4', 'offset_4'],
    [
        'january', 'february', 'march', 'april', 'may', 'june',
        'july', 'august', 'september', 'october', 'november', 'december'
    ],
]

const dataTypes = {
    background: typeInt,
    amplitude: typeInt,
    median: typeInt,
    dayOfYear_1: typeInt,
    days_1: typeInt,
    median_1: typeInt,
    slope_1: typeFloat,
    offset_1: typeFloat,
    dayOfYear_2: typeInt,
    days_2: typeInt,
    median_2: typeInt,
    slope_2: typeFloat,
    offset_2: typeFloat,
    dayOfYear_3: typeInt,
    days_3: typeInt,
    median_3: typeInt,
    slope_3: typeFloat,
    offset_3: typeFloat,
    dayOfYear_4: typeInt,
    days_4: typeInt,
    median_4: typeInt,
    slope_4: typeFloat,
    offset_4: typeFloat,
    january: typeFloat,
    february: typeFloat,
    march: typeFloat,
    april: typeFloat,
    may: typeFloat,
    june: typeFloat,
    july: typeFloat,
    august: typeFloat,
    september: typeFloat,
    october: typeFloat,
    november: typeFloat,
    december: typeFloat
}
