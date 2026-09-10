export const resolveChartBand = (selectedBand, availableBands) =>
    availableBands.includes(selectedBand) ? selectedBand : availableBands[0]
