const ee = require('#sepal/ee')

const addCloud = cloudMasking =>
    image => image.addBandsReplace(cloud(image, cloudMasking))

const cloud = (image, cloudMasking) => {
    const scoreThreshold = () => {
        switch (cloudMasking) {
        case 'AGGRESSIVE': return 0.25
        case 'MODERATE': return 0.30
        default: return 0.30
        }
    }
    const threshold = scoreThreshold()
    return image
        .selfExpression(`
            i.cloud or (!i.soil and !i.snow and 
            (cloudScore > ${threshold} or (cloudScore > 0 and i.aerosol > 0.2) or i.hazeScore == 0))
        `, {
            cloudScore: cloudScore(image)
        })
        .rename('cloud')
}

// Based on scripts by Ian Hausman, which in turn is based on script by Matt Hancher
// https://groups.google.com/d/msg/google-earth-engine-developers/i63DS-Dg8Sg/_hgCBEYeBwAJ
const cloudScore = image => {
    let score = ee.Image(1)
    let blueCirrusScore = ee.Image(0)

    // Clouds are reasonably bright in the blue or cirrus bands.
    // Use .max as a pseudo OR conditional
    blueCirrusScore = blueCirrusScore.max(image.select('blue').unitScaleClamp(0.1, 0.5))
    blueCirrusScore = blueCirrusScore.max(image.select('aerosol').unitScaleClamp(0.1, 0.5))
    blueCirrusScore = blueCirrusScore.max(image.select('cirrus').unitScaleClamp(0.1, 0.3))
    score = score.min(blueCirrusScore)

    // Clouds are reasonably bright in all visible bands.
    score = score.min(
        image.selfExpression('i.red + i.green + i.blue').unitScaleClamp(0.2, 0.8)
    )

    // Clouds are reasonably bright in all infrared bands.
    score = score.min(
        image.selfExpression('i.nir + i.swir1 + i.swir2').unitScaleClamp(0.3, 0.8)
    )

    // However, clouds are not snow.
    score = score.min(image.select('ndsi').unitScaleClamp(0.8, 0.6))

    return score
}

module.exports = addCloud
