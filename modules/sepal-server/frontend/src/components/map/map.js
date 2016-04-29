/**
 * @author Mino Togna
 */
require( './map.css' )
require( 'd3' )

var EventBus         = require( '../event/event-bus' )
var Events           = require( '../event/events' )
var GoogleMapsLoader = require( 'google-maps' )
// GoogleMapsLoader.KEY = 'qwertyuiopasdfghjklzxcvbnm'

var Sepal = require( '../main/sepal' )
// additional map components
require( './scene-areas' )

// html template
var template = require( './map.html' )
var html     = $( template( {} ) )

// google map style
var mapStyle = require( './map-style.js' )

// instance variables
var map = null

// Natural Earth Fusion Table data . see : https://www.google.com/fusiontables/DataSource?dsrcid=394713#rows:id=1
// Name:	10m_admin_0_countries
// Numeric ID:	419167
// Encrypted ID:	16CTzhDWVwwqa0e5xe4dRxQ9yoyE1hVt_3ekDFQ
var FT_TableID = "16CTzhDWVwwqa0e5xe4dRxQ9yoyE1hVt_3ekDFQ"

// overlay layers
var aoiLayer = null

var show = function () {
    $( '.app' ).append( html )

    GoogleMapsLoader.load( function ( google ) {
        map = new google.maps.Map( document.getElementById( 'map' ), {
            zoom: 3,
            minZoom: 3,
            maxZoom: 11,
            center: new google.maps.LatLng( 16.7794913, 9.6771556 ),
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            zoomControl: true,
            zoomControlOptions: {
                position: google.maps.ControlPosition.RIGHT_TOP
                , style: google.maps.ZoomControlStyle.LARGE
            },
            mapTypeControl: false,
            scaleControl: false,
            streetViewControl: false,
            rotateControl: false,
            fullscreenControl: false,
            backgroundColor: '#131314'

        } );

        map.setOptions( { styles: mapStyle } );
    } )
}

var zoomTo = function ( e, address ) {
    if ( aoiLayer ) {
        aoiLayer.setMap( null )
    }

    GoogleMapsLoader.load( function ( google ) {

        var geocoder = new google.maps.Geocoder()
        geocoder.geocode( { 'address': address }, function ( results, status ) {
            if ( status == google.maps.GeocoderStatus.OK ) {
                map.panTo( results[ 0 ].geometry.location )
                map.fitBounds( results[ 0 ].geometry.viewport )

                var FT_Query   = "SELECT 'kml_4326' FROM " + FT_TableID + " WHERE 'name_0' = '" + address + "';"
                var FT_Options = {
                    suppressInfoWindows: true,
                    query: {
                        from: FT_TableID,
                        select: 'kml_4326',
                        where: "'sovereignt' = '" + address + "';"
                    },
                    styles: [ {
                        polygonOptions: {
                            fillColor: "#FBFAF2",
                            fillOpacity: 0.02,
                            strokeOpacity: 0.25,
                            strokeWeight: 1,
                            strokeColor: '#FBFAF2'
                        }
                    } ]
                }

                aoiLayer = new google.maps.FusionTablesLayer( FT_Options )
                aoiLayer.setMap( map )
            }
        } )

        // ************************** API KEY REQUIRED
        // https://www.googleapis.com/fusiontables/v2/query?sql=
        // var q = 'select iso_2 from ' + FT_TableID
        // EventBus.dispatch(Events.AJAX.REQUEST , null , {
        //     url : 'https://www.googleapis.com/fusiontables/v2/query'
        //     , data :{ sql : q}
        //     , success : function ( response ) {
        //         console.log( response )
        //     }
        // })

    } )
}

var addLayer = function ( e, layer ) {
    if ( layer ) {
        layer.setMap( map )
    }
}

EventBus.addEventListener( Events.APP.LOAD, show )
EventBus.addEventListener( Events.MAP.ZOOM_TO, zoomTo )
EventBus.addEventListener( Events.MAP.ADD_LAYER, addLayer )
