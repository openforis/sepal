/**
 * @author Mino Togna
 */
require( './layers.scss' )
var EventBus = require( '../../../../../event/event-bus' )
var Events   = require( '../../../../../event/events' )
var Loader   = require( '../../../../../loader/loader' )
var Sortable = require( 'sortablejs' )
var Layer    = require( './layer' )

var container = null
var btnClose  = null
var btnOpen   = null
var uiLayers  = {}

var init = function ( dataVis ) {
    container = dataVis.find( '.layers-container' )
    btnClose  = dataVis.find( '.btn-close-layers' )
    btnOpen   = dataVis.find( '.btn-open-layers' )
    
    Sortable.create( container.get( 0 ), {
        handle     : ".btn-sort"
        , draggable: ".row-layer"
        , onChoose : function ( evt ) {
            $( '#data-vis .layers-container' ).css( 'width', '25%' )
            $( "#data-vis .layer-options:visible" ).hide( 0 )
            $( "#data-vis" ).find( '.row-layer.expanded' ).removeClass( 'expanded' )
        }
        , onUpdate : function ( evt ) {
            sortLayers()
        }
    } )
    
    btnClose.click( close )
    btnOpen.click( open )
}

var close = function () {
    container.velocity( {
            left: '-' + (container.width() + 16) + 'px'
        },
        {
            duration: 600,
            easing  : 'easeInSine',
            complete: function () {
                btnOpen.fadeIn( 200 )
                
            }
        }
    )
}

var open = function () {
    
    container.velocity( {
            left: '15px'
        },
        {
            duration: 600,
            easing  : 'easeOutSine',
            begin   : function () {
                btnOpen.fadeOut( 50 )
            }
        }
    )
}

var load = function ( layers ) {
    $.each( layers, function ( i, l ) {
        l.index   = i
        l.opacity = 1
        console.log( "Layers loaded at index ", i, " : ", l )
        var uiLayer = Layer.newInstance( container, l )
        uiLayer.show()
        
        uiLayers[ l.id ] = uiLayer
    } )
}

var sortLayers = function () {
    Loader.show()
    
    // update index
    var rowLayers = container.find( '.row-layer' )
    var layerIds  = []
    $.each( rowLayers, function ( i, rowLayer ) {
        var layerId = $( rowLayer ).data( 'layer-id' )
        layerIds.push( layerId )
        
        var uiLayer           = uiLayers[ layerId ]
        uiLayer.options.index = i
    } )
    
    //submit re-order request
    var params = {
        url      : '/sandbox/geo-web-viz/layers/order'
        , data   : { order: JSON.stringify( layerIds ) }
        , success: function ( response ) {
            
            $.each( uiLayers, function ( i, uiLayer ) {
                // console.log( uiLayer )
                if ( uiLayer.options.visible ) {
                    uiLayer.show()
                } else {
                    uiLayer.hide()
                }
            } )
            
            Loader.hide()
        }
    }
    
    EventBus.dispatch( Events.AJAX.POST, null, params )
    
}

module.exports = {
    init  : init
    , load: load
}