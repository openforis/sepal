/**
 * @author Mino Togna
 */
require( './map.css' )
require( 'd3' )

var EventBus         = require( '../event/event-bus' )
var Events           = require( '../event/events' )
var GoogleMapsLoader = require( 'google-maps' )
// GoogleMapsLoader.KEY = 'qwertyuiopasdfghjklzxcvbnm'

var template = require( './map.html' )
var html     = $( template( {} ) )

var mapStyle = require( './map-style.js' )

var map             = null
var scenesGridLayer = null


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
                // map.panToBounds( results[ 0 ].geometry.viewport )

                // map.setZoom( 5 )
                // map.setCenter( results[ 0 ].geometry.location )
                // panTo
                // map.panTo( results[ 0 ].geometry.location )

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

var loadScenes = function ( e, scenes ) {
    // console.log( scenes )
    GoogleMapsLoader.load( function ( google ) {


        var array = new Array()
        $.each( scenes, function ( i, scene ) {

            // NOT WORKING
            // var northeast = new google.maps.LatLng( Number( scene.upperRightCoordinate[ 0 ] ), Number( scene.upperRightCoordinate[ 1 ] ) )
            // var southwest = new google.maps.LatLng( Number( scene.lowerLeftCoordinate[ 0 ] ), Number( scene.lowerLeftCoordinate[ 1 ] ) )
            // var bounds    = new google.maps.LatLngBounds( northeast, southwest )
            // var center    = bounds.getCenter()
            // console.log( center.lat() )
            // console.log( center.lng() )

            // RECTANGLE EXAMPLE
            // var rectangle = new google.maps.Rectangle( {
            //     strokeColor  : '#FF0000',
            //     strokeOpacity: 0.1,
            //     strokeWeight : 2,
            //     fillColor    : '#FF0000',
            //     fillOpacity  : 0.05,
            //     map          : map,
            //     bounds       : {
            //         north: Number( scene.upperLeftCoordinate[ 0 ] ),
            //         south: Number( scene.lowerLeftCoordinate[ 0 ] ),
            //         east : Number( scene.upperRightCoordinate[ 1 ] ),
            //         west : Number( scene.lowerLeftCoordinate[ 1 ] )
            //     }
            // } )

            var bounds       = new google.maps.LatLngBounds()
            var polygonPaths = new Array()
            var polygon      = scene.polygon
            for ( var j = 0; j < polygon.length; j++ ) {
                var latLong  = polygon[ j ]
                var gLatLong = new google.maps.LatLng( Number( latLong[ 0 ] ), Number( latLong[ 1 ] ) )
                bounds.extend( gLatLong )

                polygonPaths.push( gLatLong )
            }

            var gPolygon = new google.maps.Polygon( {
                paths: polygonPaths,
                strokeColor: '#EBEBCD',
                strokeOpacity: 0.4,
                strokeWeight: 2,
                fillColor: '#E1E1E6',
                fillOpacity: 0.1
            } )
            // var bounds        = new google.maps.LatLngBounds()
            // var polygonCoords = [
            //     new google.maps.LatLng( Number( scene.upperLeftCoordinate[ 0 ] ), Number( scene.upperLeftCoordinate[ 1 ] ) ),
            //     new google.maps.LatLng( Number( scene.upperRightCoordinate[ 0 ] ), Number( scene.upperRightCoordinate[ 1 ] ) ),
            //     new google.maps.LatLng( Number( scene.lowerLeftCoordinate[ 0 ] ), Number( scene.lowerLeftCoordinate[ 1 ] ) ),
            //     new google.maps.LatLng( Number( scene.lowerRightCoordinate[ 0 ] ), Number( scene.lowerRightCoordinate[ 1 ] ) )
            // ]
            //
            // for ( var j = 0; j < polygonCoords.length; j++ ) {
            //     bounds.extend( polygonCoords[ j ] )
            // }

            var center = bounds.getCenter()
            console.log( "=============" )
            console.log( center.lat() + " , " + center.lng() )

            var item     = {}
            item.center  = center
            item.scene   = scene
            item.polygon = gPolygon
            array.push( item )
        } )

        var sceneAreasOverlay = new google.maps.OverlayView();

        // Add the container when the overlay is added to the map.
        sceneAreasOverlay.onAdd = function () {
            scenesGridLayer = d3
                .select( this.getPanes().overlayMouseTarget )
                .append( "div" )
                .attr( "class", "scene" );

            // Draw each marker as a separate SVG element.
            sceneAreasOverlay.draw = function () {
                var projection = this.getProjection(),
                    padding    = 15 * 2;

                var markers = scenesGridLayer.selectAll( "svg" )
                    .data( d3.entries( array ) )
                    .each( transform ) // update existing markers
                    .enter().append( "svg" )
                    .each( transform )
                    .attr( "class", "scene-area-marker" );
// Add a label.
                markers.append( "text" )
                    .attr( "x", padding - 3 )
                    .attr( "y", padding )
                    .attr( "dy", ".31em" )
                    .attr( "fill", "#FFFFFF" )
                    .text( function ( d ) {
                        // var feature = d.value;
                        // return feature.properties.name;
                        return '0'
                    } )

                // Add a circle.
                var circle = markers.append( "circle" )
                    .attr( "r", '25px' )
                    .attr( "cx", padding )
                    .attr( "cy", padding )

                    .on( 'click', function ( d ) {

                        var sceneArea   = d.value.scene
                        var sceneAreaId = sceneArea.sceneAreaId
                        console.log( sceneAreaId )


                        if ( scenesGridLayer ) {
                            scenesGridLayer
                                .selectAll( "svg" )
                                .transition()
                                .duration( 500 )
                                .style( 'fill-opacity', '.05' )

                            scenesGridLayer
                                .selectAll( "circle" )
                                .transition()
                                .duration( 500 )
                                .style( 'stroke-opacity', '.02' )
                                .style( 'fill-opacity', '.01' )

                        }

                        EventBus.dispatch( Events.SECTION.SEARCH.GET_SCENE_AREA, null, sceneAreaId )
                    } )
                    .on( 'mouseover', function ( d ) {
                        // console.log('hover')
                        d3.select( this )
                            // .select('circle')
                            .transition()
                            .duration( 200 )
                            .style( "fill-opacity", '.5' )

                        console.log( d )
                        var polygon = d.value.polygon
                        polygon.setMap( map )
                    } )
                    .on( 'mouseout', function ( d ) {
                        // console.log('out')
                        d3.select( this )
                            // .select('circle')
                            .transition()
                            .duration( 200 )
                            // .attr( "r", '1.5rem' )
                            .style( "fill-opacity", '.1' )
                        console.log( d )
                        var polygon = d.value.polygon
                        polygon.setMap( null )
                        // if (scenesGridLayer) {
                        //     scenesGridLayer
                        //         .selectAll("svg")
                        //         .transition()
                        //         .duration( 500 )
                        //         .style('fill-opacity' , '1')
                        // }

                    } )
                    ;
//	    	      layer.selectAll("circle").on('click',function(d){
//	    	    	 console.log( d );
//	    	      });
//	    	      this.getPanes().overlayMouseTarget.appendChild( )


                // setTimeout( function () {
                //     markers.selectAll( "circle" )
                //         .transition()
                //         // .duration( 1000 )
                //         // .attr( "r", '2rem' )
                //         // .transition()
                //         .duration( 1500 )
                //         .attr( "r", '1.5rem' );
                //
                // }, 1500 )

                function transform( d ) {
                    var item = d.value;
                    d        = new google.maps.LatLng( item.center.lat(), item.center.lng() );
                    d        = projection.fromLatLngToDivPixel( d );
                    return d3.select( this )
                        .style( "left", (d.x - padding) + "px" )
                        .style( "top", (d.y - padding) + "px" );
                }
            };
        };

        // Bind our overlay to the map…
        sceneAreasOverlay.setMap( map )
    } )
    // })

    // } )
}

EventBus.addEventListener( Events.APP.LOAD, show )
EventBus.addEventListener( Events.MAP.ZOOM_TO, zoomTo )
EventBus.addEventListener( Events.MAP.LOAD_SCENES, loadScenes )