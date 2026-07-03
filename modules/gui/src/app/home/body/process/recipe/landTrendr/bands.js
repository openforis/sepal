const typeInt = {precision: 'int'}
const typeFloat = {precision: 'float'}

export const getAvailableBands = () => ({
    yod: {dataType: typeInt},
    mag: {dataType: typeFloat},
    dur: {dataType: typeInt},
    preval: {dataType: typeFloat},
    postval: {dataType: typeFloat},
    startRed: {dataType: typeInt},
    startGreen: {dataType: typeInt},
    startBlue: {dataType: typeInt},
    endRed: {dataType: typeInt},
    endGreen: {dataType: typeInt},
    endBlue: {dataType: typeInt}
})

export const getGroupedBandOptions = () => [
    ['yod', 'mag', 'dur', 'preval', 'postval'],
    ['startRed', 'startGreen', 'startBlue'],
    ['endRed', 'endGreen', 'endBlue']
].map(bands => bands.map(band => ({value: band, label: band})))
