/**
 * @author Mino Togna
 */

var SceneSelectionModel = require( '../scenes-selection/scenes-selection-m' )
var GoogleMapsLoader    = require( 'google-maps' )
var SearchParams        = require( '../search/search-params' )

var landsatSceneAreas   = []
var sentinel2SceneAreas = []

var countSeletedImages = function ( sceneAreaId ) {
    var images = SceneSelectionModel.getSceneAreaSelectedImages( sceneAreaId )
    var length = images ? Object.keys( images ).length : 0
    
    return length
}

var setLandsatAreas = function ( sceneAreas ) {
    landsatSceneAreas = sceneAreas
}

var setSentinel2Areas = function ( sceneAreas ) {
    sentinel2SceneAreas = sceneAreas
}

var getLandsatAreas = function () {
    return landsatSceneAreas
}

var getLandsatAreaIds = function () {
    return getSceneAreaIds( landsatSceneAreas )
}

var getSentinel2Areas = function () {
    return sentinel2SceneAreas
}

var getSentinel2AreaIds = function () {
    return getSceneAreaIds( sentinel2SceneAreas )
}

var getSceneAreaIds = function ( sceneAreas ) {
    var ids = new Array()
    $.each( sceneAreas, function ( i, sceneArea ) {
        ids.push( sceneArea.sceneAreaId )
    } )
    return ids
}

var landsatAreasToMapPolygons = function () {
    return areasToMapPolygons( landsatSceneAreas, SearchParams.SENSORS.LANDSAT )
}

var sentinel2AreasToMapPolygons = function () {
    return areasToMapPolygons( sentinel2SceneAreas, SearchParams.SENSORS.SENTINEL2 )
}

var areasToMapPolygons = function ( scenes, dataSet ) {
    var array = new Array()
    
    GoogleMapsLoader.load( function ( google ) {
        $.each( scenes, function ( i, scene ) {
            
            var bounds       = new google.maps.LatLngBounds()
            var polygonPaths = new Array()
            var polygon      = scene.polygon
            for ( var j = 0; j < polygon.length; j++ ) {
                var latLong  = polygon[ j ]
                var gLatLong = new google.maps.LatLng( Number( latLong[ 0 ] ), Number( latLong[ 1 ] ) )
                bounds.extend( gLatLong )
                
                polygonPaths.push( gLatLong )
            }
            
            var gPolygon = new google.maps.Polygon( {
                paths        : polygonPaths,
                strokeColor  : '#C5B397',
                // strokeOpacity: 0.4,
                strokeOpacity: 1,
                strokeWeight : 2,
                fillColor    : '#C5B397',
                fillOpacity  : 0.8
            } )
            
            var item     = {}
            item.center  = bounds.getCenter()
            item.scene   = scene
            item.polygon = gPolygon
            item.dataSet = dataSet
            array.push( item )
        } )
    } )
    
    return array
}

module.exports = {
    countSeletedImages           : countSeletedImages
    , setLandsatAreas            : setLandsatAreas
    , getLandsatAreas            : getLandsatAreas
    , getLandsatAreaIds          : getLandsatAreaIds
    , setSentinel2Areas          : setSentinel2Areas
    , getSentinel2Areas          : getSentinel2Areas
    , getSentinel2AreaIds        : getSentinel2AreaIds
    , landsatAreasToMapPolygons  : landsatAreasToMapPolygons
    , sentinel2AreasToMapPolygons: sentinel2AreasToMapPolygons
}