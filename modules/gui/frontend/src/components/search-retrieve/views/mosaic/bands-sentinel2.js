/**
 * @author Mino Togna
 */

var bands = [
    { data: 'RED, GREEN, BLUE', value: 'Natural (Red, Green, Blue)' }
    , { data: 'NIR, RED, GREEN', value: 'Infrared (NIR, Red, Green)' }
    , { data: 'NIR, SWIR1, RED', value: 'False color(NIR, SWIR 1, Red)' }
    , { data: 'SWIR2, NIR, RED', value: 'False color(SWIR 2, NIR, Red)' }
    , { data: 'SWIR2, SWIR1, RED', value: 'False color(SWIR 2, SWIR 1, Red)' }
    , { data: 'SWIR2, NIR, GREEN', value: 'False color(SWIR 2, NIR, Green)' }
    , { data: 'date', value: 'Date of pixel in days' }
    , { data: 'days', value: 'Days from target day' }
]

module.exports = bands
