/**
 * @author Mino Togna
 */


var availableImages = {}
var selectedImages  = {}
var sceneAreaId     = null

var key = function ( image ) {
    return image.sceneId
}

var setAvailableImages = function ( images ) {
    availableImages = {}
    
    $.each( images, function ( i, image ) {
        availableImages[ key( image ) ] = image
    } )
}

var getAvailableImages = function () {
    return availableImages
}

var select = function ( image ) {
    selectedImages[ key( image ) ] = image
}

var deselect = function ( image ) {
    selectedImages[ key( image ) ] = null
}

var reset = function () {
    availableImages = {}
    selectedImages  = {}
}

module.exports = {
    setAvailableImages  : setAvailableImages
    , getAvailableImages: getAvailableImages
    , select            : select
    , deselect          : deselect
    , reset             : reset
    , sceneAreaId       : sceneAreaId
}