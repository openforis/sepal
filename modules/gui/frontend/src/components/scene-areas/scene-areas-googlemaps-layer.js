/**
 * @author Mino Togna
 */
var d3 = require( 'd3' )

var EventBus         = require( '../event/event-bus' )
var Events           = require( '../event/events' )
var Sepal            = require( '../main/sepal' )
var GoogleMapsLoader = require( 'google-maps' )
var google           = null

var SceneAreasOverlayView = function ( polygons, visible, zoomLevel ) {
    $.extend( this, new google.maps.OverlayView() )
    
    //array data
    this.data      = polygons
    // html container
    this.container = null
    //
    this.visible   = visible
    
    this.zoomLevel = zoomLevel
    // this.drawnCallback = drawnCallback
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
                var cls       = "scene-area-marker _" + sceneArea.sceneAreaId
                return cls
            } )
        
        // Add a label.
        var texts = markers.append( "text" )
            .attr( "x", padding - 3 )
            .attr( "y", padding )
            .attr( "dy", ".31em" )
            .attr( "fill", "#FFFFFF" )
            .style( 'fill-opacity', '1' )
            .text( function ( d ) {
                return '0'
            } )
        
        // Add a circle.
        var circles = markers.append( "circle" )
            .attr( "r", '25px' )
            .attr( "cx", padding )
            .attr( "cy", padding )
            .style( 'stroke-opacity', '.4' )
            .style( 'fill-opacity', '.1' )
            .on( 'click', function ( d ) {
                if ( Sepal.isSectionClosed() ) {
                    
                    var polygon = d.value.polygon
                    polygon.setMap( null )
                    
                    var sceneArea = d.value.scene
                    EventBus.dispatch( Events.MAP.SCENE_AREA_CLICK, null, sceneArea.sceneAreaId, d.value.dataSet )
                    
                }
            } )
            .on( 'mouseover', function ( d ) {
                d3.select( this )
                    .transition()
                    .duration( 200 )
                    .style( "fill-opacity", '.5' )
                
                var polygon = d.value.polygon
                EventBus.dispatch( Events.MAP.ADD_LAYER, null, polygon )
            } )
            
            .on( 'mouseout', function ( d ) {
                d3.select( this )
                    .transition()
                    .duration( 200 )
                    .style( "fill-opacity", '.1' )
                
                var polygon = d.value.polygon
                polygon.setMap( null )
            } )
        
        function transform( d ) {
            var item = d.value;
            d        = new google.maps.LatLng( item.center.lat(), item.center.lng() )
            d        = projection.fromLatLngToDivPixel( d )
            
            return d3.select( this )
                .style( "left", (d.x - padding) + "px" )
                .style( "top", (d.y - padding) + "px" )
        }
        
        this.updateLayerSize()
        
        var nodes = $( $this.container.node() ).children()
        if ( this.visible )
            nodes.show( 0 )
        else
            nodes.hide( 0 )
        
        this.ready = true
    }
}

SceneAreasOverlayView.prototype.onRemove = function () {
    if ( this.container ) {
        var node = $( this.container.node() )
        node.children().remove()
        node.remove()
        this.container = null
    }
}

SceneAreasOverlayView.prototype.show = function () {
    if ( this.container && !this.visible ) {
        this.visible = true
        $( this.container.node() ).children().fadeIn()
    }
}

SceneAreasOverlayView.prototype.hide = function () {
    if ( this.container && this.visible ) {
        this.visible = false
        $( this.container.node() ).children().fadeOut()
    }
}

SceneAreasOverlayView.prototype.circles = function () {
    if ( this.container ) {
        return this.container.selectAll( "circle" )
    }
}

SceneAreasOverlayView.prototype.texts = function () {
    if ( this.container ) {
        return this.container.selectAll( "text" )
    }
}

SceneAreasOverlayView.prototype.circle = function ( sceneAreaId ) {
    if ( this.container ) {
        return this.container.select( "._" + sceneAreaId + " circle" )
    }
}

SceneAreasOverlayView.prototype.text = function ( sceneAreaId ) {
    if ( this.container ) {
        return this.container.select( "._" + sceneAreaId + " text" )
    }
}

SceneAreasOverlayView.prototype.setZoomLevel = function ( zoomLevel ) {
    this.zoomLevel = zoomLevel
    this.updateLayerSize()
}

SceneAreasOverlayView.prototype.updateLayerSize = function () {
    if ( this.container ) {
        
        var radius   = 0
        var fontSize = 1
        var dx       = 0
        switch ( this.zoomLevel ) {
            case 3:
                radius   = 3
                fontSize = 3
                dx       = .70
                break
            case 4:
                radius   = 8
                fontSize = 6
                dx       = .25
                break
            case 5:
                radius   = 16
                fontSize = 8
                dx       = .1
                break
            case 6:
                radius   = 25
                fontSize = 11
                break
            case 7:
                radius   = 33
                fontSize = 14
                dx       = -0.05
                break
            case 8:
                radius   = 40
                fontSize = 17
                dx       = -0.1
                break
            case 9:
                radius   = 45
                fontSize = 20
                dx       = -0.125
                break
            case 10:
                radius   = 50
                fontSize = 23
                dx       = -0.15
                break
            case 11:
                radius   = 55
                fontSize = 26
                dx       = -0.20
                break
        }
        
        // console.debug( '=====zoom level: ', this.zoomLevel, '  ======dx: ', dx , '  ======font-size: ', fontSize  )
        this.circles()
            .transition()
            .delay( 10 )
            .duration( 600 )
            .attr( "r", function ( d ) {
                return radius + 'px'
            } )
        
        this.texts()
            .transition()
            .delay( 10 )
            .duration( 600 )
            .style( "font-size", function ( d ) {
                return fontSize + 'px'
            } )
            .attr( 'dx', function ( d ) {
                return dx + 'em'
            } )
    }
    
}

module.exports = {
    newInstance: function ( data, visible, zoomLevel ) {
        GoogleMapsLoader.load( function ( g ) {
            google = g
        } )
        return new SceneAreasOverlayView( data, visible, zoomLevel )
    }
}