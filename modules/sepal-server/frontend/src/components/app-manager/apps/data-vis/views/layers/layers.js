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
        handle      : ".btn-sort"
        , animation : 80
        , draggable : ".row-layer"
        , ghostClass: "row-layer-placeholder"
        , onChoose  : function ( evt ) {
            $( '#data-vis .layers-container' ).css( 'width', '25%' )
            $( "#data-vis .layer-options:visible" ).hide( 0 )
            $( "#data-vis" ).find( '.row-layer.expanded' ).removeClass( 'expanded' )
        }
        , onUpdate  : function ( evt ) {
            sortLayers()
        }
    } )
    
    btnClose.click( close )
    btnOpen.click( open )
    
    container.scroll( function () {
        var scrollTop = $( window ).scrollTop()
        $.each( container.find( '.layer-option-buttons' ), function ( i, elem ) {
            var optionBtns    = $( elem )
            var elementOffset = optionBtns.parent().offset().top
            optionBtns.css( 'top', (elementOffset - scrollTop + 7) + 'px' )
        } )
    } )
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
        l.index     = i
        l.opacity   = 1
        // console.log( "Layers loaded at index ", i, " : ", l )
        var uiLayer = Layer.newInstance( btnClose, l )
        uiLayer.show()
        
        uiLayers[ l.id ] = uiLayer
    } )
    EventBus.dispatch( Events.APPS.DATA_VIS.LAYERS_LOADED )
}

var addNewLayer = function ( path ) {
    
    var guid = function () {
        function s4() {
            return Math.floor( (1 + Math.random()) * 0x10000 )
                .toString( 16 )
                .substring( 1 )
        }
        
        return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4()
    }
    
    var layer  = { path: path, id: guid(), index: Object.keys( uiLayers ).length, opacity: 1 }
    layer.type = path.endsWith( 'shp' ) ? 'shape' : 'raster'
    
    // console.log( "=== ADDING NEW LAYER " + layer )
    
    var uiLayer = Layer.newInstance( btnClose, layer )
    
    uiLayers[ layer.id ] = uiLayer
}

var sortLayers = function ( callback ) {
    // if ( !callback )
    Loader.show()
    
    // update index
    var rowLayers = container.find( '.row-layer' )
    var length    = rowLayers.length
    var layerIds  = []
    $.each( rowLayers, function ( i, rowLayer ) {
        var layerId = $( rowLayer ).data( 'layer-id' )
        layerIds.push( layerId )
        
        var uiLayer           = uiLayers[ layerId ]
        uiLayer.options.index = (length - 1 - i)
    } )
    
    layerIds.reverse()
    
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
            
            // if ( callback )
            //     callback()
            // else
            Loader.hide()
        }
    }
    
    EventBus.dispatch( Events.AJAX.POST, null, params )
    
}

var deleteLayer = function ( e, layerId ) {
    
    var params = {
        url         : '/sandbox/geo-web-viz/layers/' + layerId
        , beforeSend: function () {
            Loader.show()
            
            uiLayers[ layerId ].delete()
            delete uiLayers[ layerId ]
        }
        , success   : function () {
            sortLayers()
        }
    }
    EventBus.dispatch( Events.AJAX.DELETE, null, params )
}

EventBus.addEventListener( Events.APPS.DATA_VIS.LAYER_DELETE, deleteLayer )

module.exports = {
    init         : init
    , load       : load
    , addNewLayer: addNewLayer
}