import {IMAGE_OUTPUT} from '#sepal/recipe/output/product'
import {
    PLANET_MOSAIC_INDEXES,
    PLANET_MOSAIC_SPECTRAL_BANDS,
    planetMosaicBands
} from '#sepal/recipe/type/planetMosaic'

const int10000 = {precision: 'int', min: -10000, max: 10000}

// How a Planet band is shown; which bands exist is the declaration's to say.
export const planetBandPresentation = () =>
    ({dataType: int10000})

// A table of the given declared bands, presented, for a product that shows a Planet mosaic and is not yet declared.
export const planetBandTable = bands =>
    Object.fromEntries(bands.map(({name}) => [name, planetBandPresentation()]))

export const bandPresentation = (recipe, {name} = {}) =>
    name === IMAGE_OUTPUT ? planetBandTable(planetMosaicBands(recipe.model)) : {}

// The groups Retrieve offers the bands in.
export const groupedBandPresentation = () =>
    toOptions([PLANET_MOSAIC_SPECTRAL_BANDS, PLANET_MOSAIC_INDEXES])

// The Planet bands temporal recipes offer as choices, and the presets CCDC offers over them. A choice list kept as it
// always was, not the Planet collection's schema: the collection also computes kndvi, and PSB.SD-only Daily imagery
// carries more bands, as shared CCDC declares its measures (lib/js/shared/src/recipe/type/ccdc.js).
export const TEMPORAL_PLANET_BANDS = [
    ['blue', 'green', 'red', 'nir'],
    ['ndvi', 'ndwi', 'evi', 'evi2', 'savi']
]

export const temporalPlanetBandOptions = () =>
    toOptions(TEMPORAL_PLANET_BANDS)

const toOptions = groups =>
    groups.map(group => group.map(band => ({value: band, label: band, ...planetBandPresentation()})))
