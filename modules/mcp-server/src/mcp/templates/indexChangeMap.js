module.exports = {
    id: 'index-change-map',
    recipeType: 'INDEX_CHANGE',
    name: 'Index Change Map',
    description: 'Before/after spectral index change detection. Requires two image recipes or assets to compare.',
    tags: ['change-detection', 'index', 'before-after', 'comparison'],
    requiredOverrides: ['fromImage', 'toImage'],
    model: {
        dates: {
            fromDate: '2023-01-01',
            toDate: '2024-01-01'
        },
        legend: {
            entries: [
                {color: '#d73027', value: 1, label: 'Decrease', constraints: [{band: 'difference', operator: '<', value: 0}]},
                {color: '#ffffff', value: 2, label: 'Stable', constraints: [{band: 'difference', operator: '=', value: 0}]},
                {color: '#1a9850', value: 3, label: 'Increase', constraints: [{band: 'difference', operator: '>', value: 0}]}
            ]
        },
        options: {
            minConfidence: 2.5
        }
    }
}
