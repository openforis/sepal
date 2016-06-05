/**
 * @author Mino Togna
 */

//scene area selection
var sceneAreaId     = null
var sceneAreaImages = {}
// selection
var selectedImages  = {}

var key = function ( image ) {
    return image.sceneId
}

var setSceneArea = function ( id, images ) {
    sceneAreaId     = id
    sceneAreaImages = {}
    
    $.each( images, function ( i, image ) {
        sceneAreaImages[ key( image ) ] = image
    } )
}

var getSceneAreaImages = function () {
    return sceneAreaImages
}

var getSceneAreaId = function () {
    return sceneAreaId
}

var getSceneAreaSelectedImages = function ( sceneAreaId ) {
    return selectedImages[ sceneAreaId ]
}

var select = function ( image ) {
    if ( !selectedImages[ sceneAreaId ] ) {
        selectedImages[ sceneAreaId ] = {}
    }
    
    var k                              = key( image )
    selectedImages[ sceneAreaId ][ k ] = image
}

var deselect = function ( image ) {
    var k = key( image )
    delete selectedImages[ sceneAreaId ][ k ]
    if( Object.keys( selectedImages[ sceneAreaId ] ).length <= 0 ){
        delete selectedImages[ sceneAreaId ]
    }
}

var reset = function () {
    sceneAreaImages = {}
    selectedImages  = {}
}

var areasSelection = function () {
    return Object.keys( selectedImages )
}

// var areasSelectionLength = function () {
//     return Object.keys( selectedImages ).length
// }

module.exports = {
    setSceneArea                : setSceneArea
    , getSceneAreaImages        : getSceneAreaImages
    , select                    : select
    , deselect                  : deselect
    , reset                     : reset
    , getSceneAreaId            : getSceneAreaId
    , getSceneAreaSelectedImages: getSceneAreaSelectedImages
    , areasSelection            : areasSelection
}