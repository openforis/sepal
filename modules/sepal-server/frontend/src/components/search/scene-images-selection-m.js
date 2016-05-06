/**
 * @author Mino Togna
 */

//scene area selection
var sceneAreaId     = null
var sceneAreaImages = {}
// var sceneAreaSelectedImages = {}
// selection
var selectedImages = {}

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
    var k = key( image )
    // sceneAreaSelectedImages[ k ] = image
    
    if ( !selectedImages[ sceneAreaId ] ) {
        selectedImages[ sceneAreaId ] = {}
    }
    selectedImages[ sceneAreaId ][ k ] = image
    // console.log( selectedImages )
}

var deselect = function ( image ) {
    var k                              = key( image )
    // sceneAreaSelectedImages[ k ]       = null
    delete selectedImages[ sceneAreaId ][ k ]
}

var reset = function () {
    sceneAreaImages = {}
    // sceneAreaSelectedImages = {}
    selectedImages  = {}
}

module.exports = {
    setSceneArea                : setSceneArea
    , getSceneAreaImages        : getSceneAreaImages
    , select                    : select
    , deselect                  : deselect
    , reset                     : reset
    , getSceneAreaId            : getSceneAreaId
    , getSceneAreaSelectedImages: getSceneAreaSelectedImages
}