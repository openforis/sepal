/**
 * @author Mino Togna
 */
require( 'd3' )
require( './scene-areas.css' )

var EventBus         = require( '../event/event-bus' )
var Events           = require( '../event/events' )
var GoogleMapsLoader = require( 'google-maps' )

var SceneAreaModel = require( '../scenes-selection/scenes-selection-m' )

var Sepal = require( '../main/sepal' )

// map layer
var sceneAreasLayer = null
// div wrapper for svg circles
var sceneAreasDiv   = null
// last scene areas loded
var sceneAreas      = null

var loadSceneAreas = function ( e, scenes ) {
    
    if ( sceneAreasLayer ) {
        sceneAreasLayer.setMap( null )
    }
    
    sceneAreas = scenes
    
    GoogleMapsLoader.load( function ( google ) {
        
        var array = new Array()
        $.each( scenes, function ( i, scene ) {
            
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
                strokeColor  : '#EBEBCD',
                strokeOpacity: 0.4,
                strokeWeight : 2,
                fillColor    : '#E1E1E6',
                fillOpacity  : 0.1
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
        
        sceneAreasLayer = new google.maps.OverlayView()
        
        // Add the container when the overlay is added to the map.
        sceneAreasLayer.onAdd = function () {
            sceneAreasDiv = d3
                .select( this.getPanes().overlayMouseTarget )
                .append( "div" )
                .attr( "class", "scene-areas-section" )
            
            // Draw each marker as a separate SVG element.
            sceneAreasLayer.draw = function () {
                var projection = this.getProjection(),
                    padding    = 15 * 2
                
                var markers = sceneAreasDiv.selectAll( "svg" )
                    .data( d3.entries( array ) )
                    .each( transform ) // update existing markers
                    .enter().append( "svg" )
                    .each( transform )
                    .attr( "class", function ( d ) {
                        var sceneArea = d.value.scene
                        // EventBus.dispatch( Events.MAP.SCENE_AREA_CLICK, null, sceneArea.sceneAreaId )
                        var cls       = "scene-area-marker _" + sceneArea.sceneAreaId
                        return cls
                    } )
                
                
                // Add a label.
                markers.append( "text" )
                    .attr( "x", padding - 3 )
                    .attr( "y", padding )
                    .attr( "dy", ".31em" )
                    .attr( "fill", "#FFFFFF" )
                    .text( function ( d ) {
                        return '0'
                    } )
                
                // Add a circle.
                var circle = markers.append( "circle" )
                    .attr( "r", '25px' )
                    .attr( "cx", padding )
                    .attr( "cy", padding )
                    
                    .on( 'click', function ( d ) {
                        if ( Sepal.isSectionClosed() ) {
                            
                            var polygon = d.value.polygon
                            polygon.setMap( null )
                            
                            var sceneArea = d.value.scene
                            EventBus.dispatch( Events.MAP.SCENE_AREA_CLICK, null, sceneArea.sceneAreaId )
                            
                        }
                    } )
                    
                    .on( 'mouseover', function ( d ) {
                        
                        if ( Sepal.isSectionClosed() ) {
                            
                            d3.select( this )
                                .transition()
                                .duration( 200 )
                                .style( "fill-opacity", '.5' )
                            
                            var polygon = d.value.polygon
                            EventBus.dispatch( Events.MAP.ADD_LAYER, null, polygon )
                        }
                        
                    } )
                    
                    .on( 'mouseout', function ( d ) {
                        
                        if ( Sepal.isSectionClosed() ) {
                            d3.select( this )
                                .transition()
                                .duration( 200 )
                                .style( "fill-opacity", '.1' )
                            
                            var polygon = d.value.polygon
                            polygon.setMap( null )
                        }
                        
                    } )
                
                function transform( d ) {
                    var item = d.value;
                    d        = new google.maps.LatLng( item.center.lat(), item.center.lng() );
                    d        = projection.fromLatLngToDivPixel( d );
                    return d3.select( this )
                        .style( "left", (d.x - padding) + "px" )
                        .style( "top", (d.y - padding) + "px" );
                }
            }
        }
        
        sceneAreasLayer.onRemove = function () {
            if ( sceneAreasDiv ) {
                sceneAreasDiv.remove()
                sceneAreasDiv = null
            }
        }
        
        EventBus.dispatch( Events.MAP.ADD_LAYER, null, sceneAreasLayer )
    } )
    
}

var showApplicationSection = function ( e ) {
    if ( sceneAreasDiv ) {
        sceneAreasDiv
            .selectAll( "circle" )
            .transition()
            .duration( 500 )
            .style( 'stroke-opacity', '.02' )
            .style( 'fill-opacity', '.01' )
        
        sceneAreasDiv
            .selectAll( "text" )
            .transition()
            .duration( 500 )
            .style( 'fill-opacity', '.05' )
    }
}

var reduceApplicationSection = function ( e ) {
    if ( sceneAreasDiv ) {
        sceneAreasDiv
            .selectAll( "circle" )
            .transition()
            .delay( 400 )
            .duration( 800 )
            .style( 'stroke-opacity', '.4' )
            .style( 'fill-opacity', '.1' )
        
        sceneAreasDiv
            .selectAll( "text" )
            .transition()
            .delay( 400 )
            .duration( 800 )
            .style( 'fill-opacity', '1' )
    }
}

var sceneAreaChange = function ( e, sceneAreaId ) {
    // sceneAreasDiv.selectAll("."+sceneAreaId)
    var images = SceneAreaModel.getSceneAreaSelectedImages( sceneAreaId )
    var length = images ? Object.keys( images ).length : 0
    // console.log( images )
    
    if ( sceneAreasDiv ) {
        
        sceneAreasDiv
            .select( "._" + sceneAreaId + " text" )
            // .selectAll( "text" )
            .transition()
            .delay( 400 )
            .duration( 800 )
            .text( function ( d ) {
                return length
            } )
        
        var bgColor = '#818181'
        if ( length > 0 ) {
            bgColor = '#9CEBB5'
        }
        sceneAreasDiv
            .select( "._" + sceneAreaId + " circle" )
            .transition()
            .delay( 400 )
            .duration( 800 )
            .style( 'fill', bgColor )
            .style( 'stroke', bgColor )
        
    }
}

var resetSceneAreas = function ( e ) {
    $.each( sceneAreas, function ( i, sceneArea ) {
        sceneAreaChange( null, sceneArea.sceneAreaId )
    } )
}

EventBus.addEventListener( Events.SECTION.SEARCH.SCENE_AREAS_LOADED, loadSceneAreas )

EventBus.addEventListener( Events.SECTION.SHOW, showApplicationSection )
EventBus.addEventListener( Events.SECTION.REDUCE, reduceApplicationSection )

EventBus.addEventListener( Events.MODEL.SCENE_AREA.CHANGE, sceneAreaChange )

EventBus.addEventListener( Events.MAP.SCENE_AREA_RESET, resetSceneAreas )