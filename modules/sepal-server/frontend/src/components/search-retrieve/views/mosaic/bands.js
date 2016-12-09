/**
 * @author Mino Togna
 */

var bands = [
    { data: 'B3, B2, B1', value: 'Natural (Red, Green, Blue)' }
    , { data: 'B4, B3, B2', value: 'Infrared (NIR, Red, Green)' }
    , { data: 'B4, B5, B3', value: 'False color(NIR, SWIR 1, Red)' }
    , { data: 'B7, B4, B3', value: 'False color(SWIR 2, NIR, Red)' }
    , { data: 'B7, B5, B3', value: 'False color(SWIR 2, SWIR 1, Red)' }
    , { data: 'B7, B4, B2', value: 'False color(SWIR 2, NIR, Green)' }
    , { data: 'B4_brdf, B5_brdf, B3_brdf', value: 'False color(NIR, SWIR 1, Red - BRDF corrected)' }
    , { data: 'B7_brdf, B4_brdf, B3_brdf', value: 'False color(SWIR 2, NIR, Red - BRDF corrected)' }
    , { data: 'B7_brdf, B5_brdf, B3_brdf', value: 'False color(SWIR 2, SWIR 1, Red - BRDF corrected)' }
    , { data: 'temp', value: 'Temperature' }
    , { data: 'date', value: 'Date of pixel in days' }
    , { data: 'days', value: 'Days from target day' }
]

module.exports = bands
