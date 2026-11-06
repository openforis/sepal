import Color from 'color'
import Dygraph from 'dygraphs'

export const errorBandPlotter = event => {
    const {dygraph, setName, drawingContext, color, points, plotArea} = event
    if (!dygraph.getBooleanOption('errorBars') || dygraph.getBooleanOption('customBars')
        || dygraph.getBooleanOption('stepPlot', setName) || dygraph.getBooleanOption('fillGraph', setName)) {
        return Dygraph.Plotters.errorPlotter(event)
    }
    const connect = dygraph.getBooleanOption('connectSeparatedPoints', setName)
    drawingContext.fillStyle = Color(color).alpha(dygraph.getNumericOption('fillAlpha', setName)).rgb().string()
    drawingContext.beginPath()
    let band = []
    for (const point of points) {
        if (connect && point.yval === null) {
            continue
        }
        if (!Number.isFinite(point.y)) {
            drawBand(drawingContext, band, plotArea)
            band = []
        } else {
            band.push(point)
        }
    }
    drawBand(drawingContext, band, plotArea)
    drawingContext.fill()
}

// One outline per continuous band avoids rasterising thousands of adjoining quadrilaterals on every zoom.
const drawBand = (canvas, points, {y, h}) => {
    if (points.length < 2) {
        return
    }
    const position = (point, bound) => y + h * (isNaN(point[bound]) ? point.y : point[bound])
    canvas.moveTo(points[0].canvasx, position(points[0], 'y_top'))
    for (let i = 1; i < points.length; i++) {
        canvas.lineTo(points[i].canvasx, position(points[i], 'y_top'))
    }
    for (let i = points.length - 1; i >= 0; i--) {
        canvas.lineTo(points[i].canvasx, position(points[i], 'y_bottom'))
    }
    canvas.closePath()
}
