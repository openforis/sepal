import {BASEMAP_BAND_NAMES, PLANET_BASEMAP_BANDS} from '#sepal/recipe/planet/planetBands'

export const processBasemapCollection = collection => {
    return collection
        .select(PLANET_BASEMAP_BANDS, BASEMAP_BAND_NAMES)
}
