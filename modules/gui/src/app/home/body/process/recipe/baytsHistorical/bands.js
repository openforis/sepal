import _ from 'lodash'

const typeFloat = {precision: 'float'}
const typeInt = {precision: 'int'}

export const getAvailableBands = recipe => {
    // TODO: Filter
    const orbits = recipe.model.options.orbits
    return bands
    // return _.pickBy((_value, name) => name.ends)
    //     .map(bandType => bandsByGroup[bandType] || {})
    //     .forEach(groupBands => Object.keys(groupBands).forEach(band => availableBands[band] = groupBands[band]))
    // return availableBands
}

const bandGroups = [
    ['VV_mean_asc', 'VV_std_asc', 'VV_speckle_asc'],
    ['VH_mean_asc', 'VH_std_asc', 'VH_speckle_asc'],
    ['dominant_orbit_asc'],
    ['VV_mean_desc', 'VV_std_desc', 'VV_speckle_desc'],
    ['VH_mean_desc', 'VH_std_desc', 'VH_speckle_desc'],
    ['dominant_orbit_desc'],
]

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
