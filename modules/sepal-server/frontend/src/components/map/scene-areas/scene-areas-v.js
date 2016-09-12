/**
 * @author Mino Togna
 */
require( './scene-areas.css' )

var EventBus     = require( '../../event/event-bus' )
var Events       = require( '../../event/events' )
var LayerManager = require( './scene-areas-googlemaps-layer' )
var layer        = null
var zoomLevel    = 6
var visible      = false

var add = function ( scenes ) {
    if ( layer ) {
        layer.setMap( null )
    }
    
    visible = true
    layer   = LayerManager.newInstance( scenes, updateLayerSize )
    EventBus.dispatch( Events.MAP.ADD_LAYER, null, layer )
}

var show = function () {
    if ( layer && visible ) {
        layer.show()
    }
}

var hide = function () {
    if ( layer && visible ) {
        layer.hide()
    }
}

var toggleVisibility = function () {
    visible       = !visible
    layer.visible = visible
    
    var circles = layer.circles()
    var texts   = layer.texts()
    
    if ( !visible ) {
        circles
            .transition()
            .duration( 500 )
            .style( 'stroke-opacity', '0' )
            .style( 'fill-opacity', '0' )
        
        texts
            .transition()
            .duration( 500 )
            .style( 'fill-opacity', '0' )
    } else {
        circles
            .transition()
            .duration( 800 )
            .style( 'stroke-opacity', '.4' )
            .style( 'fill-opacity', '.1' )
        
        texts
            .transition()
            .duration( 800 )
            .style( 'fill-opacity', '1' )
    }
    
}

var setCount = function ( sceneAreaId, count ) {
    if ( layer ) {
        
        layer.text( sceneAreaId )
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
        layer.circle( sceneAreaId )
            .transition()
            .delay( 400 )
            .duration( 800 )
            .style( 'fill', bgColor )
            .style( 'stroke', bgColor )
        
    }
}


var reset = function () {
    visible = false
    toggleVisibility()
    visible = true
    
    $.each( this.data, function ( i, item ) {
        var sceneArea = item.scene
        setCount( sceneArea.sceneAreaId, 0 )
    } )
}

var setZoomLevel = function ( value ) {
    zoomLevel = value
    updateLayerSize()
}

var updateLayerSize = function () {
    if ( layer ) {
        
        var radius   = 0
        var fontSize = 1
        var dx       = 0
        switch ( zoomLevel ) {
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
        
        // console.debug( '=====zoom level: ', zoomLevel, '  ======dx: ', dx )
        layer.circles()
            .transition()
            .delay( 10 )
            .duration( 600 )
            .attr( "r", function ( d ) {
                return radius + 'px'
            } )
        
        layer.texts()
            .transition()
            .delay( 10 )
            .duration( 600 )
            // .style( 'fill-opacity', function ( d ) {
            //     return (zoomLevel <= 4 ) ? '0' : '1'
            // } )
            .style( "font-size", function ( d ) {
                return fontSize + 'px'
            } )
            .attr( 'dx', function ( d ) {
                return dx + 'em'
            } )
    }
    
}

module.exports = {
    add               : add
    , show            : show
    , hide            : hide
    , toggleVisibility: toggleVisibility
    , reset           : reset
    , setCount        : setCount
    , setZoomLevel    : setZoomLevel
}