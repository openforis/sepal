const typeInt = {precision: 'int'}

export const getAvailableBands = () => ({
    first_sensor: {dataType: typeInt},
    first_ydoy: {dataType: typeInt},
    confirming_sensor: {dataType: typeInt},
    confirming_ydoy: {dataType: typeInt}
})

export const getGroupedBandOptions = () => {
    const toOption = band => ({value: band, label: band})
    return [
        [
            toOption('first_sensor'),
            toOption('first_ydoy')
        ],
        [
            toOption('confirming_sensor'),
            toOption('confirming_ydoy')
        ]
    ]
}
