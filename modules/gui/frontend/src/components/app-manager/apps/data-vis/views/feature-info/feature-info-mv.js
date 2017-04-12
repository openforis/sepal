/**
 * @author Mino Togna
 */
var EventBus = require( '../../../../../event/event-bus' )
var Events   = require( '../../../../../event/events' )
var View     = require( './feature-info-v' )

var layers = {}

var init = function ( container ) {
    View.init( container )
}

var addLayer = function ( e, layer ) {
    layers[ layer.id ] = layer
    View.toggleInfo( layer )
}

var removeLayer = function ( e, layer ) {
    View.toggleInfo( layer )
}

var deleteLayer = function ( e, layerId ) {
    delete layers[ layerId ]
    View.deleteInfo( layerId )
}

var getFeatureInfo = function ( e, lat, lng ) {
    var params = {
        url         : '/sandbox/geo-web-viz/layers/features/' + lat + '/' + lng
        , beforeSend: function () {
            View.reset()
        }
        , success   : function ( response ) {
            View.hideLoader()
            
            var layerIds = Object.keys( response )
            if ( layerIds.length > 0 ) {
                View.show()
                
                $.each( layerIds, function ( i, layerId ) {
                    var layer = layers[ layerId ]
                    if ( layer ) {
                        View.add( layer, response[ layerId ] )
                    }
                } )
            }
            
        }
    }
    EventBus.dispatch( Events.AJAX.GET, null, params )
}

EventBus.addEventListener( Events.APPS.DATA_VIS.ADD_MAP_LAYER, addLayer )
EventBus.addEventListener( Events.APPS.DATA_VIS.REMOVE_MAP_LAYER, removeLayer )
EventBus.addEventListener( Events.APPS.DATA_VIS.LAYER_DELETE, deleteLayer )

EventBus.addEventListener( Events.APPS.DATA_VIS.GET_FEATURE_INFO, getFeatureInfo )

module.exports = {
    init: init
}