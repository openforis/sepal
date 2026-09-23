// The bands a BAYTS alert product carries. The algorithm selects by this list, the GUI describes the product
// from it, and what a previous-alerts asset must hold to be continued from is exactly these - a SEPAL BAYTS
// export carries them and nothing else.

export const ALERT_BANDS = [
    'non_forest_probability',
    'change_probability',
    'flag',
    'flag_orbit',
    'first_detection_date',
    'confirmation_date'
]
