import {msg} from '~/translate'

// Which bands a time series has is its declaration's to say; this is how they are shown.
export const bandPresentation = () => ({
    count: {
        dataType: {precision: 'int'},
        label: msg('process.timeSeries.bands.count')
    }
})
