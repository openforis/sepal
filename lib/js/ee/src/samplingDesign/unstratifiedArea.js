import {map, of} from 'rxjs'

import ee from '#sepal/ee/ee'

// For unstratified Sampling Design (stratification.skip), the total AOI area is computed at the export
// boundary from the AOI GEOMETRY - geometry.area(maxError) - rather than by a hidden per-stratum
// pixelArea().reduceRegion raster request in the Stratification panel. Independent of sampling/export scale.
export const AOI_AREA_MAX_ERROR_METERS = 1

// Pure: stamp the resolved AOI area onto the (single, synthetic) unstratified allocation row(s).
export const withUnstratifiedArea = (allocation, area) =>
    allocation.map(row => ({...row, area}))

// Resolve the allocation the samplers and collection/CSV metadata consume. For unstratified designs the AOI
// geometry area is injected (getInfo'd to a client-side number, since density math and metadata read `area`
// as a number); stratified designs already carry per-stratum area and pass through unchanged. `getInfo$` is
// injectable so unit tests can stub the EE call.
export const unstratifiedAllocation$ = ({allocation, stratification, geometry, getInfo$ = ee.getInfo$}) =>
    stratification?.skip
        ? getInfo$(geometry.area(AOI_AREA_MAX_ERROR_METERS), 'AOI area (unstratified sampling design)').pipe(
            map(area => withUnstratifiedArea(allocation, area))
        )
        : of(allocation)
