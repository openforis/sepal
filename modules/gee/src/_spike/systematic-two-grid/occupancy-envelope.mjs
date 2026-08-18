export const SOURCE_GRID_TRANSFORM_ERROR = 0.25
export const SOURCE_GRID_BUFFER_ERROR = 0.01
export const SOURCE_GRID_BOUNDARY_EPSILON = 0.001

export const SOURCE_GRID_BUFFER_RADIUS = Math.SQRT1_2
    + SOURCE_GRID_TRANSFORM_ERROR
    + SOURCE_GRID_BUFFER_ERROR
    + SOURCE_GRID_BOUNDARY_EPSILON

export const bufferOccupancyTile = ({ee, geometry, sourceProjection}) => geometry
    .transform(
        sourceProjection,
        ee.ErrorMargin(SOURCE_GRID_TRANSFORM_ERROR, 'projected')
    )
    .buffer(
        SOURCE_GRID_BUFFER_RADIUS,
        ee.ErrorMargin(SOURCE_GRID_BUFFER_ERROR, 'projected'),
        sourceProjection
    )

export const occupancyEnvelopeAtScale = sourceScaleMetres => ({
    sourceScaleMetres,
    transformErrorGridUnits: SOURCE_GRID_TRANSFORM_ERROR,
    bufferErrorGridUnits: SOURCE_GRID_BUFFER_ERROR,
    boundaryEpsilonGridUnits: SOURCE_GRID_BOUNDARY_EPSILON,
    halfCellDiagonalGridUnits: Math.SQRT1_2,
    radiusGridUnits: SOURCE_GRID_BUFFER_RADIUS,
    transformErrorMetres: SOURCE_GRID_TRANSFORM_ERROR * sourceScaleMetres,
    bufferErrorMetres: SOURCE_GRID_BUFFER_ERROR * sourceScaleMetres,
    boundaryEpsilonMetres: SOURCE_GRID_BOUNDARY_EPSILON * sourceScaleMetres,
    radiusMetres: SOURCE_GRID_BUFFER_RADIUS * sourceScaleMetres
})
