/**
 * @author Mino Togna
 */
var sceneAreas = null

var setSceneAreas = function ( areas ) {
    sceneAreas = areas
}

var getSceneAreas   = function () {
    return sceneAreas
}
var getSceneAreaIds = function () {
    var ids = new Array()
    $.each( sceneAreas, function ( i, sceneArea ) {
        ids.push( sceneArea.sceneAreaId )
    } )
    return ids
}

module.exports = {
    setSceneAreas    : setSceneAreas
    , getSceneAreas  : getSceneAreas
    , getSceneAreaIds: getSceneAreaIds
}