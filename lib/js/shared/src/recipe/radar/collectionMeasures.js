// The measures a Sentinel-1 collection offers a temporal consumer, one value per image: lib/js/ee/src/radar/collection.js
// carries the two polarisations and the relative orbit number, and timeSeries/collection.js derives their ratio
// whenever it is asked for. A different contract from a Radar Mosaic's output, which composites that collection
// (type/radarMosaic.js).
export const RADAR_MEASURES = ['VV', 'VH', 'ratio_VV_VH', 'orbit']

// What each image carries where timeSeries/collection.js classifies it: the ratio is derived only afterwards.
export const RADAR_CLASSIFIED_BANDS = ['VV', 'VH', 'orbit']
