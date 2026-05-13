const parameterSchema = require('./schema.json')
const {rules} = require('./rules')
const {getDefaults} = require('./defaults')

module.exports = {
    id: 'RADAR_MOSAIC',
    name: 'Radar Mosaic',
    description: 'S1 SAR backscatter mosaic. Sees through clouds — the only satellite option for cloud-prone regions.',
    useCases: [
        'Cloud-prone regions where optical fails (tropics, monsoon, polar winter)',
        'Flood / surface-water mapping',
        'Forest/non-forest mapping in the tropics',
        'Multi-temporal aggregates (min/max/mean/median/stdDev per polarization) for stable seasonal stats',
        'Input for radar classification or change detection'
    ],
    terms: ['SAR', 'radar', 'Sentinel-1', 'S1', 'time-scan', 'point-in-time', 'VV', 'VH', 'backscatter', 'speckle', 'polarization', 'ASCENDING', 'DESCENDING', 'orbit', 'dB', 'decibel', 'terrain correction', 'gamma0'],
    chooseWhen: 'Wants imagery through clouds, asks for radar/SAR, names S1, or talks about VV/VH/backscatter/speckle.',
    dontChooseWhen: 'Wants visible/multispectral, natural/false color, or vegetation indices — use MOSAIC.',
    outputs: 'Point-in-time {targetDate}: VV, VH, ratio_VV_VH, orbit. Time-scan {fromDate, toDate}: min/max/mean/median/stdDev per polarization, NDCV.',
    parameterSchema,
    rules,
    getDefaults,
    workflowSteps: [
        {id: 'aoi', name: 'Area of Interest', description: 'Define the geographic area', fields: ['aoi']},
        {id: 'dates', name: 'Date Range', description: 'Set the temporal range — point-in-time or time-scan', fields: ['dates']},
        {id: 'options', name: 'Processing Options', description: 'Configure orbits, speckle filtering, terrain correction', fields: ['options']}
    ],
    bands: {
        pointInTime: ['VV', 'VH', 'ratio_VV_VH', 'orbit'],
        timeScan: ['VV_min', 'VV_mean', 'VV_med', 'VV_max', 'VV_std', 'VH_min', 'VH_mean', 'VH_med', 'VH_max', 'VH_std', 'ratio_VV_med_VH_med', 'NDCV'],
        metadata: ['dayOfYear', 'daysFromTarget']
    },
    visualizations: [
        {name: 'VV', type: 'continuous', bands: ['VV'], min: [-20], max: [2]},
        {name: 'VH', type: 'continuous', bands: ['VH'], min: [-25], max: [-5]},
        {name: 'VV/VH/Ratio', type: 'rgb', bands: ['VV', 'VH', 'ratio_VV_VH'], min: [-20, -25, 0], max: [2, -5, 10]}
    ]
}
