/**
 * @author Mino Togna
 */
require( './layers.scss' )

var Sortable = require( 'sortablejs' )
var Layer    = require( './layer' )

var container = null
var btnClose  = null
var btnOpen   = null

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
        }
        , onUpdate : function ( evt ) {
            var itemEl = evt.item
            // console.log( $( itemEl ).data( 'id' ) )
            // console.log( "UPD ", evt )
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
        console.log( l )
        var uiLayer = Layer.newInstance( container, l )
        uiLayer.show()
    } )
}


module.exports = {
    init  : init
    , load: load
}