export const getAvailableBands = () => ({
    available_image_count: {dataType: {precision: 'int', min: 0, max: 999}, label: 'Available image count'},
    occluded_count: {dataType: {precision: 'int', min: 0, max: 999}, label: 'Occluded image count'},
    total_changes: {dataType: {precision: 'int', min: 0, max: 999}, label: 'Total changes'},
    first_change_date_above_threshold: {dataType: {precision: 'int', min: 0, max: 2000000000000}, label: 'First change date (ms)'},
    post_fcd_change_count: {dataType: {precision: 'int', min: 0, max: 999}, label: 'Post-FCD change count'},
    post_fcd_nochange_count: {dataType: {precision: 'int', min: 0, max: 999}, label: 'Post-FCD no-change count'},
    post_fcd_occluded_count: {dataType: {precision: 'int', min: 0, max: 999}, label: 'Post-FCD occluded count'},
    post_fcd_valid_image_count: {dataType: {precision: 'int', min: 0, max: 999}, label: 'Post-FCD valid image count'},
    post_fcd_change_repeatability_pct: {dataType: {precision: 'float', min: 0, max: 100}, label: 'Post-FCD change repeatability (%)'},
    binary_timeseries_decision: {dataType: {precision: 'int', min: 0, max: 1}, label: 'Binary time-series decision'},
    fcd_decision_map: {dataType: {precision: 'int', min: 0, max: 2000000000000}, label: 'FCD decision map (ms)'},
    delta_index_change_count: {dataType: {precision: 'int', min: 0, max: 999}, label: 'Index-drop count'},
    binary_delta_index_decision_map: {dataType: {precision: 'int', min: 0, max: 1}, label: 'Binary index-drop decision'},
    binary_delta_class_decision_map: {dataType: {precision: 'int', min: 0, max: 1}, label: 'Binary dClass decision'},
    binary_combined_delta_decision_map: {dataType: {precision: 'int', min: 0, max: 1}, label: 'Binary combined decision'},
    from_class_count: {dataType: {precision: 'int', min: 0, max: 999}, label: 'From-class count'},
    to_class_count: {dataType: {precision: 'int', min: 0, max: 999}, label: 'To-class count'},
    binary_decision_from_to_map: {dataType: {precision: 'int', min: 0, max: 1}, label: 'Binary from-to decision'}
})

export const getGroupedBandOptions = () => {
    const bands = getAvailableBands()
    return [
        Object
            .keys(bands)
            .map(band => ({value: band, ...bands[band]}))
    ]
}
