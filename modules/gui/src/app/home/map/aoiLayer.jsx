import Color from 'color'

import {selectFrom} from '~/stateUtils'

import {AoiGeometryLayer} from './aoiGeometryLayer'
import {EETableLayer} from './eeTableLayer'
import {RecipeGeometryLayer} from './recipeGeometryLayer'

export const countryEETable = 'users/wiell/SepalResources/gaul'

// The aoi's own style authority. Kept beside the layer rather than in featureLayerStyle, which owns the
// asset-only shape (colour modes, point size, per-value colours) that an aoi has no use for.
//
// The defaults decompose the outline and fill this layer used to hard-code (#FFFFFF50 / #FFFFFF08) into a
// relative fill opacity plus a whole-layer opacity the tile overlay applies client-side, so an existing
// recipe with no persisted style looks exactly as it did.
export const DEFAULT_AOI_STYLE = {
    color: '#FFFFFF',
    width: 2,
    fillOpacity: 0.1,
    opacity: 80 / 255
}

export const resolveAoiStyle = layerConfig => ({...DEFAULT_AOI_STYLE, ...layerConfig?.style})

// The full effective style with only `opacity` replaced, for persisting a row-level opacity change.
export const withUpdatedAoiOpacity = (layerConfig, opacity) => ({...resolveAoiStyle(layerConfig), opacity})

// Style ownership is split: the options modal owns color, width and fillOpacity, the row scrubber owns
// opacity. Applying modal settings therefore carries the persisted opacity through rather than writing
// back whatever the modal resolved when it opened.
export const withUpdatedAoiRenderSettings = (layerConfig, {color, width, fillOpacity}) => ({
    ...resolveAoiStyle(layerConfig),
    color,
    width,
    fillOpacity
})

export const withAlpha = (color, alpha) => Color(color).alpha(alpha).hexa()

// The render boundary. The server draws the outline at full strength and the fill at its own relative
// opacity; whole-layer opacity stays client-side, applied to the mounted tiles. Folding it into either
// colour here would apply it twice.
export const aoiRenderStyle = style => ({
    color: style.color,
    fillColor: withAlpha(style.color, style.fillOpacity),
    width: style.width,
    opacity: style.opacity
})

export const countryToEETable = aoi => ({
    type: 'EE_TABLE',
    id: countryEETable,
    keyColumn: 'id',
    key: aoi.areaCode || aoi.countryCode,
    buffer: aoi.buffer
})

// While a polygon is being edited the applied aoi would sit under it. Only the fallback is suppressed:
// a layer given an aoi of its own, as the panel's preview map is, still renders.
export const isAoiSuppressed = ({layerConfig = {}, recipe}) =>
    !layerConfig.aoi && !!selectFrom(recipe, 'ui.aoi.editing')

export const AoiLayer = ({id, layerConfig = {}, layerIndex, map, recipe}) => {
    if (isAoiSuppressed({layerConfig, recipe})) {
        return null
    }
    const aoi = layerConfig.aoi || recipe.model.aoi || {}
    const {color, fillColor, width, opacity} = aoiRenderStyle(resolveAoiStyle(layerConfig))
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
                width={width}
                opacity={opacity}
                layerIndex={layerIndex}
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
                width={width}
                opacity={opacity}
                layerIndex={layerIndex}
            />
        )
        case 'POLYGON':
        case 'ASSET':
        case 'RECIPE': return (
            <AoiGeometryLayer
                id={id}
                map={map}
                aoi={aoi}
                color={color}
                fillColor={fillColor}
                width={width}
                opacity={opacity}
                layerIndex={layerIndex}
            />
        )
        default: return (
            <RecipeGeometryLayer
                id={id}
                map={map}
                color={color}
                fillColor={fillColor}
                width={width}
                opacity={opacity}
                layerIndex={layerIndex}
                recipe={recipe}
            />
        )
    }
}
