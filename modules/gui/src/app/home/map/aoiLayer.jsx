import {EETableLayer} from './eeTableLayer'
import {PolygonLayer} from './polygonLayer'
import {RecipeGeometryLayer} from './recipeGeometryLayer'

export const countryEETable = 'users/wiell/SepalResources/gaul'

export const removeAoiLayer = map => {
    map.removeLayer('Aoi')
}

const color = '#FFFFFF50'
const fillColor = '#FFFFFF08'

export const countryToEETable = aoi => ({
    type: 'EE_TABLE',
    id: countryEETable,
    keyColumn: 'id',
    key: aoi.areaCode || aoi.countryCode,
    buffer: aoi.buffer,
    color,
    fillColor
})

export const AoiLayer = ({id, layerConfig = {}, layerIndex, map, recipe}) => {
    const aoi = layerConfig.aoi || recipe.model.aoi || {}
    switch (aoi.type) {
        case 'COUNTRY': return (
            <EETableLayer
                id={id}
                map={map}
                tableId={countryEETable}
                columnName='id'
                columnValue={aoi.areaCode || aoi.countryCode}
                buffer={aoi.buffer}
                color={color}
                fillColor={fillColor}
                layerIndex={layerIndex}
                watchedProps={aoi}
            />
        )
        case 'EE_TABLE': return (
            <EETableLayer
                id={id}
                map={map}
                tableId={aoi.id}
                columnName={aoi.keyColumn}
                columnValue={aoi.key}
                buffer={aoi.buffer}
                color={color}
                fillColor={fillColor}
                layerIndex={layerIndex}
                watchedProps={aoi}
            />
        )
        case 'POLYGON': return (
            <PolygonLayer
                id={id}
                map={map}
                path={aoi.path}
                fill={false}
                color={color}
                fillColor={fillColor}
            />
        )
        default: return (
            <RecipeGeometryLayer
                id={id}
                map={map}
                color={color}
                fillColor={fillColor}
                layerIndex={layerIndex}
                recipe={recipe}
            />
        )
    }
}
