import Dygraph from 'dygraphs'
import {afterEach, describe, expect, it, vi} from 'vitest'

import {errorBandPlotter} from './errorBandPlotter'

afterEach(() => vi.restoreAllMocks())

describe('the shaded uncertainty band', () => {
    it('follows both bounds, in plot coordinates, with the series colour and opacity', () => {
        const points = [point(1, 0.25, 0.75), point(2, 0.15, 0.65), point(3, 0.35, 0.55)]

        const canvas = draw(points, {color: 'rgba(51, 102, 153, 0.8)', fillAlpha: 0.25})

        expect(canvas.contours).toEqual([[[1, 35], [2, 25], [3, 45], [3, 65], [2, 75], [1, 85]]])
        expect(canvas.fillStyle).toBe('rgba(51, 102, 153, 0.25)')
        expect(canvas.fills).toBe(1)
    })

    it('draws a dense band as one contour, retaining every sample and its bounds', () => {
        const points = Object.freeze(Array.from({length: 15000}, (_, i) => Object.freeze(point(i, 0.25, 0.75))))

        const canvas = draw(points)

        expect(canvas.contours).toHaveLength(1)
        expect(canvas.contours[0]).toHaveLength(points.length * 2)
        expect(canvas.contours[0].slice(0, points.length)).toEqual(points.map(({canvasx}) => [canvasx, 35]))
        expect(canvas.contours[0].slice(points.length)).toEqual(points.map(({canvasx}) => [canvasx, 85]).reverse())
    })

    it('connects across null observations when the series connects separated points', () => {
        const canvas = draw([point(1), point(2), missing(null), point(4), point(5)], {connectSeparatedPoints: true})

        expect(canvas.contours.map(contour => contour.map(([x]) => x))).toEqual([[1, 2, 4, 5, 5, 4, 2, 1]])
    })

    it('leaves null observations as gaps when the series does not connect separated points', () => {
        const canvas = draw([point(1), point(2), missing(null), point(4), point(5)])

        expect(canvas.contours.map(contour => contour.map(([x]) => x))).toEqual([[1, 2, 2, 1], [4, 5, 5, 4]])
    })

    it('retains explicit NaN gaps even when the series connects separated points', () => {
        const canvas = draw([point(1), point(2), missing(NaN), point(4), point(5)], {connectSeparatedPoints: true})

        expect(canvas.contours.map(contour => contour.map(([x]) => x))).toEqual([[1, 2, 2, 1], [4, 5, 5, 4]])
    })

    it('collapses missing uncertainty to the mean and preserves a zero bound', () => {
        const canvas = draw([{...point(1), y_top: NaN, y_bottom: undefined}, point(2, 0, 0.75)])

        expect(canvas.contours).toEqual([[[1, 60], [2, 10], [2, 85], [1, 60]]])
    })

    it('keeps zero uncertainty at the mean', () => {
        const canvas = draw([point(1, 0.5, 0.5), point(2, 0.5, 0.5)])

        expect(canvas.contours).toEqual([[[1, 60], [2, 60], [2, 60], [1, 60]]])
    })

    it.each([{points: []}, {points: [point(1)]}, {points: [point(1), missing(NaN), point(3)]}])('fills no area for empty or isolated points: $points', ({points}) => {
        expect(draw(points).contours).toEqual([])
    })

    it.each(['customBars', 'stepPlot', 'fillGraph'])('keeps the library renderer for %s', option => {
        const original = vi.spyOn(Dygraph.Plotters, 'errorPlotter').mockImplementation(() => {})
        const event = eventOf([point(1), point(2)], {[option]: true})

        errorBandPlotter(event)

        expect(original).toHaveBeenCalledExactlyOnceWith(event)
        expect(event.drawingContext.fills).toBe(0)
    })
})

const point = (canvasx, y_top = 0.25, y_bottom = 0.75) => ({canvasx, yval: 0.5, y: 0.5, y_top, y_bottom})

const missing = yval => ({canvasx: 3, yval, y: NaN, y_top: NaN, y_bottom: NaN})

const draw = (points, options) => {
    const event = eventOf(points, options)
    errorBandPlotter(event)
    return event.drawingContext
}

const eventOf = (points, options = {}) => ({
    points,
    setName: 'fitted',
    color: options.color || '#336699',
    plotArea: {y: 10, h: 100},
    dygraph: {
        getBooleanOption: name => name === 'errorBars' || Boolean(options[name]),
        getNumericOption: name => name === 'fillAlpha' ? options.fillAlpha ?? 0.15 : undefined
    },
    drawingContext: {
        contours: [],
        fills: 0,
        beginPath() {},
        moveTo(x, y) {
            this.current = [[x, y]]
        },
        lineTo(x, y) {
            this.current.push([x, y])
        },
        closePath() {
            this.contours.push(this.current)
        },
        fill() {
            this.fills++
        }
    }
})
