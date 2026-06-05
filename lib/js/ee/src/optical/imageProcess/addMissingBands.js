import ee from '#sepal/ee/ee'

const addMissingBands = () =>
    image => image
        .addBandsReplace(
            image.selectOrDefault(
                ['aerosol', 'cirrus'],
                ee.Image(0))
        )

export default addMissingBands
