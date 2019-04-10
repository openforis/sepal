import ee


# Based on scripts by Ian Hausman, which in turn is based on script by Matt Hancher
# https://groups.google.com/d/msg/google-earth-engine-developers/i63DS-Dg8Sg/_hgCBEYeBwAJ
def cloud_score(image):
    def rescale(image, exp, thresholds):
        return image.expression(exp, {'i': image}) \
            .subtract(thresholds[0]).divide(thresholds[1] - thresholds[0])

    # Compute several indicators of cloudyness and take the minimum of them.
    score = ee.Image(1)
    blueCirrusScore = ee.Image(0)

    # Clouds are reasonably bright in the blue or cirrus bands.
    # Use .max as a pseudo OR conditional
    blueCirrusScore = blueCirrusScore.max(rescale(image, 'i.blue', [0.1, 0.5]))
    blueCirrusScore = blueCirrusScore.max(rescale(image, 'i.aerosol', [0.1, 0.5]))
    blueCirrusScore = blueCirrusScore.max(rescale(image, 'i.cirrus', [0.1, 0.3]))
    score = score.min(blueCirrusScore)

    # Clouds are reasonably bright in all visible bands.
    score = score.min(rescale(image, 'i.red + i.green + i.blue', [0.2, 0.8]))

    # Clouds are reasonably bright in all infrared bands.
    score = score.min(
        rescale(image, 'i.nir + i.swir1 + i.swir2', [0.3, 0.8]))

    # However, clouds are not snow.
    ndsi = image.normalizedDifference(['green', 'swir1'])

    score = score.min(rescale(ndsi, 'i', [0.8, 0.6]))

    return score
