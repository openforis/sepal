// What a pixel-by-pixel comparison of two images establishes, read band by band from Earth Engine: for each band,
// how many pixels are valid in one image and not the other, the largest absolute difference where both are valid,
// and how many pixels are valid in both. A band is usable only with a finite number for each, and pixels valid in
// both; a comparison is usable only when both images have the same bands, every one of them usable. An unusable
// comparison shows neither that the images are identical nor that they differ.

import _ from 'lodash'

export const pixelComparison = ({bands, referenceBands, maskDifferences, maxAbsoluteDifference, jointlyValid}) => {
    const compared = Array.isArray(bands) ? bands : []
    return {
        sameBands: compared.length > 0 && _.isEqual(compared, referenceBands),
        unusable: compared.filter(band => !(
            Number.isFinite(maskDifferences?.[band])
            && Number.isFinite(maxAbsoluteDifference?.[band])
            && Number.isFinite(jointlyValid?.[band])
            && jointlyValid[band] > 0
        )),
        jointlyValid: _.pick(jointlyValid, compared),
        maskDiffering: _.pickBy(_.pick(maskDifferences, compared), count => count !== 0),
        valueDiffering: _.pickBy(_.pick(maxAbsoluteDifference, compared), difference => difference !== 0)
    }
}

export const identical = comparison =>
    usable(comparison) && _.isEmpty(comparison.maskDiffering) && _.isEmpty(comparison.valueDiffering)

export const different = comparison =>
    usable(comparison) && !(_.isEmpty(comparison.maskDiffering) && _.isEmpty(comparison.valueDiffering))

const usable = ({sameBands, unusable}) => sameBands && !unusable.length
