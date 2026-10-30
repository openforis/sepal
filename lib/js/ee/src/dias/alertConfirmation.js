// Slice of `array` (axis 0) aligned so that, across offsets 0..observations-1,
// position i holds observations [i, i+1, ..., i+observations-1]. Generalizes
// dias_runner.py's fixed 3-slot window (di1/di2/di3) to an arbitrary window size.
const windowSlice = (array, offset, observations) =>
    offset === observations - 1
        ? array.arraySlice(0, offset)
        : array.arraySlice(0, offset, offset - (observations - 1))

// Ported from dias_runner.py's dias_alert(): given the per-pixel array of
// [DI, source, ydoy] triples (sorted by acquisition, oldest first), flags the
// first run of `observations` consecutive DI values >= threshold and returns the
// sensor/date of both the first and the confirming (last) observation in that run.
export const confirmAlerts = ({collection, threshold, observations, regionName, processDate}) => {
    const allDi = collection.toArray()

    const di = allDi.arraySlice(1, 0, 1).arrayProject([0])
    const src = allDi.arraySlice(1, 1, 2).arrayProject([0])
    const ydoy = allDi.arraySlice(1, 2, 3).arrayProject([0])

    let isAlert = windowSlice(di, 0, observations).gte(threshold)
    for (let offset = 1; offset < observations; offset++) {
        isAlert = isAlert.and(windowSlice(di, offset, observations).gte(threshold))
    }

    const firstInRun = (array, bandName) =>
        windowSlice(array, 0, observations)
            .arrayMask(isAlert)
            .arrayPad([1], 0)
            .arraySlice(0, 0, 1)
            .arrayFlatten([[bandName]])
            .selfMask()

    const lastInRun = (array, bandName) =>
        windowSlice(array, observations - 1, observations)
            .arrayMask(isAlert)
            .arrayPad([1], 0)
            .arraySlice(0, 0, 1)
            .arrayFlatten([[bandName]])
            .selfMask()

    const firstSensor = firstInRun(src, 'first_sensor')
    const firstYdoy = firstInRun(ydoy, 'first_ydoy')
    const confirmingSensor = lastInRun(src, 'confirming_sensor')
    const confirmingYdoy = lastInRun(ydoy, 'confirming_ydoy')

    return firstSensor
        .addBands(firstYdoy)
        .addBands(confirmingSensor)
        .addBands(confirmingYdoy)
        .set({
            di_threshold: threshold,
            observations,
            process_date: processDate,
            region_name: regionName
        })
}
