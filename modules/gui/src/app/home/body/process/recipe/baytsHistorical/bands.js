import _ from 'lodash'

const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

export const getAvailableBands = recipe => {
    const orbitBandPostfixes = {
        ASCENDING: 'asc',
        DESCENDING: 'desc',
    }
    const orbits = recipe.model.options.orbits
    const bandNames = orbits
        .map(orbit => Object.keys(bands)
            .filter(band => band.endsWith(`_${orbitBandPostfixes[orbit]}`))
        )
        .flat()
    return _.pick(bands, bandNames)
}

const bands = {
    VV_mean_asc: {dataType: typeFloat},
    VV_std_asc: {dataType: typeFloat},
    VV_speckle_asc: {dataType: typeFloat},
    VH_mean_asc: {dataType: typeFloat},
    VH_std_asc: {dataType: typeFloat},
    VH_speckle_asc: {dataType: typeFloat},
    dominant_orbit_asc: {dataType: typeFloat},
    VV_mean_desc: {dataType: typeFloat},
    VV_std_desc: {dataType: typeFloat},
    VV_speckle_desc: {dataType: typeFloat},
    VH_mean_desc: {dataType: typeFloat},
    VH_std_desc: {dataType: typeFloat},
    VH_speckle_desc: {dataType: typeFloat},
    dominant_orbit_desc: {dataType: typeInt},
}
