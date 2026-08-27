import {msg} from '~/translate'

const typeInt = {precision: 'int'}
const typeFloat = {precision: 'float'}

export const getAvailableBands = () => ({
    yod: {dataType: typeInt, label: msg('process.landTrendr.bands.yod')},
    mag: {dataType: typeFloat, label: msg('process.landTrendr.bands.mag')},
    dur: {dataType: typeInt, label: msg('process.landTrendr.bands.dur')},
    preval: {dataType: typeFloat, label: msg('process.landTrendr.bands.preval')},
    postval: {dataType: typeFloat, label: msg('process.landTrendr.bands.postval')},
    rmse: {dataType: typeFloat, label: msg('process.landTrendr.bands.rmse')},
    sig: {dataType: typeFloat, label: msg('process.landTrendr.bands.sig')},
    startRed: {dataType: typeInt, label: msg('process.landTrendr.bands.startRed')},
    startGreen: {dataType: typeInt, label: msg('process.landTrendr.bands.startGreen')},
    startBlue: {dataType: typeInt, label: msg('process.landTrendr.bands.startBlue')},
    endRed: {dataType: typeInt, label: msg('process.landTrendr.bands.endRed')},
    endGreen: {dataType: typeInt, label: msg('process.landTrendr.bands.endGreen')},
    endBlue: {dataType: typeInt, label: msg('process.landTrendr.bands.endBlue')}
})

export const getGroupedBandOptions = () => {
    const availableBands = getAvailableBands()
    return [
        ['yod', 'mag', 'dur', 'preval', 'postval', 'rmse', 'sig'],
        ['startRed', 'startGreen', 'startBlue'],
        ['endRed', 'endGreen', 'endBlue']
    ].map(bands => bands.map(band => ({value: band, ...availableBands[band]})))
}
