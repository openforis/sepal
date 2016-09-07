/**
 * @author Mino Togna
 */
require( 'd3' )
require( './scene-areas.css' )

var EventBus         = require( '../../event/event-bus' )
var Events           = require( '../../event/events' )
var Sepal            = require( '../../main/sepal' )
var GoogleMapsLoader = require( 'google-maps' )
var google           = null

var SceneAreasOverlayView = function ( polygons ) {
    //this extends google.maps.OverlayView object
    $.extend( this, new google.maps.OverlayView() )
    
    //array data
    this.data      = polygons
    // html container
    this.container = null
    //
    this.visible   = true
    
}

SceneAreasOverlayView.prototype.onAdd = function () {
    this.container
        = d3
        .select( this.getPanes().overlayMouseTarget )
        .append( "div" )
        .attr( "class", "scene-areas-section" )
    
    var $this = this
    // Draw each marker as a separate SVG element.
    this.draw = function () {
        var projection = this.getProjection(),
            padding    = 30 * 2
        
        var markers = this.container.selectAll( "svg" )
            .data( d3.entries( this.data ) )
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
                        .style( "fill-opacity", function ( d ) {
                            return $this.visible ? '.1' : '0'
                        } )
                    
                    var polygon = d.value.polygon
                    polygon.setMap( null )
                }
                
            } )
        
        function transform( d ) {
            var item = d.value;
            d        = new google.maps.LatLng( item.center.lat(), item.center.lng() )
            d        = projection.fromLatLngToDivPixel( d )
            
            return d3.select( this )
                .style( "left", (d.x - padding) + "px" )
                .style( "top", (d.y - padding) + "px" )
        }
    }
}

SceneAreasOverlayView.prototype.onRemove = function () {
    if ( this.container ) {
        this.container.remove()
        this.container = null
    }
}

SceneAreasOverlayView.prototype.show = function () {
    if ( this.container && this.visible ) {
        this.container
            .selectAll( "circle" )
            .transition()
            .delay( 400 )
            .duration( 800 )
            .style( 'stroke-opacity', '.4' )
            .style( 'fill-opacity', '.1' )
        
        this.container
            .selectAll( "text" )
            .transition()
            .delay( 400 )
            .duration( 800 )
            .style( 'fill-opacity', '1' )
    }
}

SceneAreasOverlayView.prototype.hide = function () {
    if ( this.container && this.visible ) {
        this.container
            .selectAll( "circle" )
            .transition()
            .duration( 500 )
            .style( 'stroke-opacity', '.02' )
            .style( 'fill-opacity', '.01' )
        
        this.container
            .selectAll( "text" )
            .transition()
            .duration( 500 )
            .style( 'fill-opacity', '.05' )
    }
}

SceneAreasOverlayView.prototype.toggleVisibility = function () {
    this.visible = !this.visible
    
    if ( !this.visible ) {
        this.container
            .selectAll( "circle" )
            .transition()
            .duration( 500 )
            .style( 'stroke-opacity', '0' )
            .style( 'fill-opacity', '0' )
        
        this.container
            .selectAll( "text" )
            .transition()
            .duration( 500 )
            .style( 'fill-opacity', '0' )
    } else {
        this.container
            .selectAll( "circle" )
            .transition()
            // .delay( 400 )
            .duration( 800 )
            .style( 'stroke-opacity', '.4' )
            .style( 'fill-opacity', '.1' )
        
        this.container
            .selectAll( "text" )
            .transition()
            // .delay( 400 )
            .duration( 800 )
            .style( 'fill-opacity', '1' )
    }
    
}

SceneAreasOverlayView.prototype.setCount = function ( sceneAreaId, count ) {
    if ( this.container ) {
        
        this.container
            .select( "._" + sceneAreaId + " text" )
            .transition()
            .delay( 400 )
            .duration( 800 )
            .text( function ( d ) {
                return count
            } )
        
        var bgColor = '#818181'
        if ( count > 0 ) {
            bgColor = '#9CEBB5'
        }
        this.container
            .select( "._" + sceneAreaId + " circle" )
            .transition()
            .delay( 400 )
            .duration( 800 )
            .style( 'fill', bgColor )
            .style( 'stroke', bgColor )
        
    }
}

SceneAreasOverlayView.prototype.reset = function () {
    this.visible = false
    this.toggleVisibility()
    this.visible = true
    
    var $this = this
    $.each( this.data, function ( i, item ) {
        var sceneArea = item.scene
        // sceneAreaChange( null, sceneArea.sceneAreaId )
        $this.setCount( sceneArea.sceneAreaId, 0 )
    } )
}

SceneAreasOverlayView.prototype.setZoomLevel = function ( zoomLevel ) {
    // console.log( zoomLevel )
    
    var radius   = 0
    var fontSize = 1
    var dx = 0
    switch ( zoomLevel ) {
        case 3:
            radius   = 3
            fontSize = 3
            dx = .70
            break
        case 4:
            radius   = 8
            fontSize = 6
            dx = .35
            break
        case 5:
            radius   = 16
            fontSize = 8
            break
        case 6:
            radius   = 25
            fontSize = 11
            break
        case 7:
            radius   = 33
            fontSize = 14
            break
        case 8:
            radius   = 40
            fontSize = 17
            break
        case 9:
            radius   = 45
            fontSize = 20
            break
        case 10:
            radius   = 50
            fontSize = 23
            break
        case 11:
            radius   = 55
            fontSize = 26
            break
    }
    
    
    this.container
        .selectAll( "circle" )
        .transition()
        .delay( 10 )
        .duration( 600 )
        .attr( "r", function ( d ) {
            return radius + 'px'
        } )
    
    this.container
        .selectAll( "text" )
        .transition()
        .delay( 10 )
        .duration( 600 )
        // .style( 'fill-opacity', function ( d ) {
        //     return (zoomLevel <= 4 ) ? '0' : '1'
        // } )
        .style( "font-size", function ( d ) {
            return fontSize + 'px'
        } )
        .attr('dx',function ( d ) {
            return dx+'em'
        })
}

module.exports = {
    newInstance: function ( data ) {
        GoogleMapsLoader.load( function ( g ) {
            google = g
        } )
        return new SceneAreasOverlayView( data )
    }
}