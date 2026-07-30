// Translation key for the feature overlay on/off checkbox tooltip: it describes the action (show/hide) rather
// than repeating the layer name. A layer is visible unless explicitly `disabled`.
export const overlayToggleTooltipKey = featureLayer =>
    featureLayer?.disabled !== true
        ? 'map.featureLayer.toggle.hide'
        : 'map.featureLayer.toggle.show'
