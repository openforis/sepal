// The Labels layer's own style authority, shared by the renderer and the settings panel. Labels is a
// Google StyledMapType, not an Earth Engine layer, so it has nothing in common with the asset or aoi
// style shapes and deliberately does not borrow from them. It carries no opacity: StyledMapType exposes
// no opacity control and renders through an internal path that cannot be wrapped.

// Google's own feature-type names, so a disabled category maps straight onto a rule without translation.
export const LABELS_CATEGORIES = ['administrative', 'landscape', 'poi', 'road', 'transit', 'water']

const allEnabled = () =>
    Object.fromEntries(LABELS_CATEGORIES.map(category => [category, true]))

export const DEFAULT_LABELS_STYLE = {
    categories: allEnabled()
}

// The style Labels has always rendered with. Kept byte-for-byte as the enabled-default base, so a recipe
// with no Labels configuration looks exactly as it did.
export const labelsBaseStyle = [
    {featureType: 'all', stylers: [{visibility: 'off'}]},
    {elementType: 'labels.text.fill', stylers: [{color: '#ebd1aa'}, {visibility: 'on'}]},
    {elementType: 'labels.text.stroke', stylers: [{color: '#000000'}, {visibility: 'on'}, {weight: 2}]},
    {elementType: 'geometry.stroke', stylers: [{color: '#000000'}, {visibility: 'on'}]},
    {featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{color: '#ebe5dd'}, {visibility: 'on'}]},
    {
        featureType: 'administrative.locality',
        elementType: 'labels.text.fill',
        stylers: [{color: '#ebd9ca'}, {visibility: 'on'}]
    },
    {featureType: 'road', elementType: 'geometry', stylers: [{color: '#ebd1b1'}, {visibility: 'on'}]},
    {featureType: 'road', elementType: 'geometry.stroke', stylers: [{color: '#212a37'}, {visibility: 'on'}]},
    {featureType: 'road', elementType: 'labels.text.fill', stylers: [{color: '#ebe1db'}, {visibility: 'on'}]},
    {featureType: 'road.highway', elementType: 'geometry', stylers: [{color: '#ebbba2'}, {visibility: 'on'}]},
    {featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{color: '#1f2835'}, {visibility: 'on'}]}
]

// Categories are merged per entry and copied, so a partial persisted style keeps the categories it omits
// and no two resolves share one mutable object. Only categories are read: the persisted style carries
// nothing else, and a stray key must not survive into the resolved style.
export const resolveLabelsStyle = layerConfig => ({
    categories: {...allEnabled(), ...layerConfig?.style?.categories}
})

export const withUpdatedLabelsCategories = categories => ({categories: {...categories}})

// A disabled category hides its whole Google feature group. The rule has to come after the base style,
// which switches groups back on, for it to take effect.
export const labelsMapTypeStyles = ({categories}) => [
    ...labelsBaseStyle,
    ...LABELS_CATEGORIES
        .filter(category => categories[category] === false)
        .map(featureType => ({featureType, stylers: [{visibility: 'off'}]}))
]
