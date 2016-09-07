/**
 * @author Mino Togna
 */

var SceneAreaModel = require( '../../scenes-selection/scenes-selection-m' )
var GoogleMapsLoader = require( 'google-maps' )

this.scenes = []

this.countSeletedImages = function ( sceneAreaId ) {
    var images = SceneAreaModel.getSceneAreaSelectedImages( sceneAreaId )
    var length = images ? Object.keys( images ).length : 0
    
    return length
}

this.scenesToMapPolygons = function ( ) {
    var array = new Array()
    
    var $this = this
    GoogleMapsLoader.load( function ( google ) {
        $.each( $this.scenes, function ( i, scene ) {
            
            // RECTANGLE EXAMPLE
            // var rectangle = new google.maps.Rectangle( {
            //     strokeColor  : '#FF0000',
            //     strokeOpacity: 0.1,
            //     strokeWeight : 2,
            //     fillColor    : '#FF0000',
            //     fillOpacity  : 0.05,
            //     map          : map,
            //     bounds       : {
            //         north: Number( scene.upperLeftCoordinate[ 0 ] ),
            //         south: Number( scene.lowerLeftCoordinate[ 0 ] ),
            //         east : Number( scene.upperRightCoordinate[ 1 ] ),
            //         west : Number( scene.lowerLeftCoordinate[ 1 ] )
            //     }
            // } )
            
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
                // fillOpacity  : 0.1
            } )
            // var bounds        = new google.maps.LatLngBounds()
            // var polygonCoords = [
            //     new google.maps.LatLng( Number( scene.upperLeftCoordinate[ 0 ] ), Number( scene.upperLeftCoordinate[ 1 ] ) ),
            //     new google.maps.LatLng( Number( scene.upperRightCoordinate[ 0 ] ), Number( scene.upperRightCoordinate[ 1 ] ) ),
            //     new google.maps.LatLng( Number( scene.lowerLeftCoordinate[ 0 ] ), Number( scene.lowerLeftCoordinate[ 1 ] ) ),
            //     new google.maps.LatLng( Number( scene.lowerRightCoordinate[ 0 ] ), Number( scene.lowerRightCoordinate[ 1 ] ) )
            // ]
            //
            // for ( var j = 0; j < polygonCoords.length; j++ ) {
            //     bounds.extend( polygonCoords[ j ] )
            // }
            
            var item     = {}
            item.center  = bounds.getCenter()
            item.scene   = scene
            item.polygon = gPolygon
            array.push( item )
        } )
    } )
    
    return array
}

module.exports = this