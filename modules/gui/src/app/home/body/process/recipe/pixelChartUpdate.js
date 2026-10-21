import _ from 'lodash'

import {resolveChartBand} from './chartBandSelection'

// What an open Time Series or CCDC chart does with what it reads at its pixel on an update, from its props now and
// before (`prevProps`, absent on mount): `latLng`, the pixel charted; `operationsGate`, why its operations may not be
// requested (pixelOperationsAvailability); `computation`, what they are computed from; and its `selectedBand` input.
// `bands` are those it offers. The answer, {close, clear, select, load}: close the chart; let go of what it reads and
// shows; select another band; read the band named. In this order:
//   - a closed chart reads nothing;
//   - a withdrawing gate closes the chart, whatever band is selected;
//   - a band no longer offered is replaced before anything is read: the form still holds the old one until the update
//     the replacement causes, which reads the new one. With none offered, nothing is read;
//   - a change to what it is computed from, its pixel or its band reads the current result, once the gate allows;
//   - a gate that appears lets go of what is read until it clears, and its clearing reads again.
export const pixelChartUpdate = (props, prevProps, bands) => {
    const now = chartOf(props)
    if (!now.latLng) {
        return CLEAR
    }
    if (now.gate?.withdraw) {
        return CLOSE
    }
    const offered = resolveChartBand(now.band, bands) ?? null
    if (offered !== now.band) {
        return {...CLEAR, select: offered}
    }
    if (!offered) {
        return CLEAR
    }
    const before = prevProps && chartOf(prevProps)
    if (!before || !_.isEqual([now.computation, now.latLng, now.band], [before.computation, before.latLng, before.band])) {
        return now.gate ? CLEAR : {...CLEAR, load: offered}
    }
    if (now.gate && !before.gate) {
        return CLEAR
    }
    return !now.gate && before.gate ? {...CLEAR, load: offered} : KEEP
}

const chartOf = ({latLng, operationsGate, computation, inputs: {selectedBand}}) =>
    ({latLng, gate: operationsGate, computation, band: selectedBand.value ?? null})

const KEEP = {}
const CLEAR = {clear: true}
const CLOSE = {close: true}
