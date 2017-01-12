/**
 * @author Mino Togna
 */

var Layer = require( './layer' )

var container = null
var btnClose  = null
var btnOpen   = null

var init = function ( dataVis ) {
    container = dataVis.find( '.layers-container' )
    btnClose  = dataVis.find( '.btn-close-layers' )
    btnOpen   = dataVis.find( '.btn-open-layers' )
    
    btnClose.click( close )
    btnOpen.click( open )
    
}

var close = function () {
    container.velocity( {
            left: '-30%'
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
        l.index = i
        var uiLayer = Layer.newInstance( container, l )
        uiLayer.show()
    } )
}


module.exports = {
    init  : init
    , load: load
}