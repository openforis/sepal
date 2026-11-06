import _ from 'lodash'
import PropTypes from 'prop-types'

import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {downloadObject} from '~/widget/download'
import {Panel} from '~/widget/panel/panel'

import {pixelChartCsv} from './pixelChartCsv'

// A pixel chart panel's Export CSV button, the first of its buttons: it downloads the chart prepared for a band at a pixel
// (ccdcChart.js, landTrendrChart.js) as `records` exports it, over the whole period prepared, whatever is zoomed. The
// recipe is only named in the file's name. Without a chart it is disabled (exportableChart).
export const PixelChartExport = ({recipe, chart, records}) => (
    <Panel.Buttons.Extra>
        <Button
            look='default'
            icon='download'
            label={msg('process.chartPixel.exportCsv.label')}
            tooltip={msg('process.chartPixel.exportCsv.tooltip')}
            disabled={!chart}
            onClick={() => download({recipe, chart, records})}
        />
    </Panel.Buttons.Extra>
)

// A chart is exported only once every response its panel needs for it has arrived (the panel's to say, by giving none
// before), while the band and pixel it was read for are still those selected, and when something was read: what was read
// for one selection is never exported under another's names.
export const exportableChart = (chart, {band, latLng}) =>
    chart && !chart.empty && chart.band === band && _.isEqual(chart.latLng, latLng) ? chart : null

const download = ({recipe, chart, records}) => {
    const {band, latLng} = chart
    const csv = pixelChartCsv({band, latLng, records: records(chart)})
    downloadObject(new Blob([csv], {type: 'text/csv;charset=utf-8'}), filename(recipe, chart))
}

const filename = (recipe, {band, latLng: {lat, lng}}) =>
    `${recipe.title || recipe.placeholder}_${band}_${lat.toFixed(5)}_${lng.toFixed(5)}.csv`

PixelChartExport.propTypes = {
    records: PropTypes.func.isRequired,
    recipe: PropTypes.object.isRequired,
    chart: PropTypes.object
}
