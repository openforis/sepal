/**
 * @author Mino Togna
 */

var bands = [
  {data: 'red, green, blue', value: 'Natural (Red, Green, Blue)', panSharpening: true}
  , {data: 'nir, red, green', value: 'Infrared (NIR, Red, Green)', panSharpening: true}
  , {data: 'nir, swir1, red', value: 'False color (NIR, SWIR 1, Red)'}
  , {data: 'swir2, nir, red', value: 'False color (SWIR 2, NIR, Red)'}
  , {data: 'swir2, swir1, red', value: 'False color (SWIR 2, SWIR 1, Red)'}
  , {data: 'swir2, nir, green', value: 'False color (SWIR 2, NIR, Green)'}
  , {data: 'unixTimeDays', value: 'Date', date: true}
  , {data: 'dayOfYear', value: 'Day of year', date: true}
  , {data: 'daysFromTarget', value: 'Days from target date', date: true}
]

module.exports = bands
