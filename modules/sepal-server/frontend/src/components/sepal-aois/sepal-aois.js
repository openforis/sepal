/**
 * @author Mino Togna
 */

var EventBus         = require( '../event/event-bus' )
var Events           = require( '../event/events' )
var GoogleMapsLoader = require( 'google-maps' )

var FT_URL     = 'https://www.googleapis.com/fusiontables/v2/query'
var FT_TableID = "15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F"

var loadAoiList = function ( callback ) {
    
    var query = "SELECT ISO,NAME_FAO FROM " + FT_TableID + " WHERE NAME_FAO NOT EQUAL TO '' ORDER BY NAME_FAO ASC"
    var data  = { sql: query, key: GoogleMapsLoader.KEY }
    
    var params = {
        url      : FT_URL
        , data   : data
        , success: function ( response ) {
            var aois = []
            $.each( response.rows, function ( i, row ) {
                aois.push( { data: row[ 0 ], value: row[ 1 ] } )
            } )
            
            callback( aois )
        }
    }
    EventBus.dispatch( Events.AJAX.GET, null, params )
}

var getFusionTableLayer = function ( isoCode ) {
    var FT_Options = {
        suppressInfoWindows: true,
        query              : {
            from  : FT_TableID,
            select: 'geometry',
            where : "'ISO' = '" + isoCode + "';"
        },
        styles             : [ {
            polygonOptions: {
                fillColor    : "#FBFAF2",
                fillOpacity  : 0.07,
                strokeColor  : '#FBFAF2',
                strokeOpacity: 0.15,
                strokeWeight : 1
            }
        } ]
    }
    
    var fusionTableLayer = new google.maps.FusionTablesLayer( FT_Options )
    return fusionTableLayer
}

var loadBounds = function ( isoCode, callback ) {
    var query = "SELECT geometry FROM " + FT_TableID + " WHERE ISO = '" + isoCode + "' ORDER BY NAME_FAO ASC"
    var data  = { sql: query, key: GoogleMapsLoader.KEY }
    
    var params = {
        url      : FT_URL
        , data   : data
        , success: function ( response ) {
            var bounds              = new google.maps.LatLngBounds()
            var geometryCollections = response.rows[ 0 ]
            
            $.each( geometryCollections, function ( i, geometryCollection ) {
                $.each( geometryCollection.geometries, function ( j, geometry ) {
                    $.each( geometry.coordinates, function ( k, latLngs ) {
                        $.each( latLngs, function ( l, latLng ) {
                            var gLatLng = new google.maps.LatLng( Number( latLng[ 1 ] ), Number( latLng[ 0 ] ) )
                            bounds.extend( gLatLng )
                        } )
                    } )
                } )
            } )
            callback( bounds )
        }
    }
    EventBus.dispatch( Events.AJAX.GET, null, params )
}

module.exports = {
    loadAoiList          : loadAoiList
    , getFusionTableLayer: getFusionTableLayer
    , loadBounds         : loadBounds
}