(function () {
    var createMap = function ( mapIndex ) {
        return new google.maps.Map(
            document.getElementById( 'map' + mapIndex ), {
                zoom   : 4,
                minZoom: 3,
                maxZoom: 13,
                center : new google.maps.LatLng( 16.7794913, 9.6771556 ),
            } )
    }
    
    var maps = [ createMap( 1 ), createMap( 2 ) ]
    google.maps.event.addListener( maps[ 0 ], 'bounds_changed', (function () {
        maps[ 1 ].setCenter( maps[ 0 ].getCenter() )
        maps[ 1 ].setZoom( maps[ 0 ].getZoom() )
    }) );
    google.maps.event.addListener( maps[ 1 ], 'bounds_changed', (function () {
        maps[ 0 ].setCenter( maps[ 1 ].getCenter() )
        maps[ 0 ].setZoom( maps[ 1 ].getZoom() )
    }) );
    
    maps[ 1 ].setCenter( maps[ 0 ].getCenter() )
    $( '#form' ).submit( function ( e ) {
        e.preventDefault()
        preview( 1 )
        preview( 2 )
    } )
    
    $( '#sceneIdForm' ).submit( function ( e ) {
        e.preventDefault()
        previewScenes( 1 )
        previewScenes( 2 )
    } )
    
    
    var shape          = null
    var drawingManager = new google.maps.drawing.DrawingManager( {
        drawingControl       : true,
        drawingControlOptions: {
            position    : google.maps.ControlPosition.TOP_CENTER,
            drawingModes: [
                google.maps.drawing.OverlayType.POLYGON
            ]
        },
        polygonOptions       : {
            fillOpacity : 0,
            strokeWeight: 2
        }
    } );
    drawingManager.setMap( maps[ 0 ] );
    google.maps.event.addListener( drawingManager, 'overlaycomplete', function ( e ) {
        drawingManager.setDrawingMode( null );
        if ( shape != null )
            shape.setMap( null )
        var newShape  = e.overlay;
        shape         = newShape
        newShape.type = e.type;
        google.maps.event.addListener( newShape, 'click', function () {
            shape.setMap( null )
            shape = null
        } );
    } )
    
    function createPolygon() {
        var polygon = []
        shape.getPath().forEach( function ( a ) {
            polygon.push( [ a.lng(), a.lat() ] )
        } )
        polygon.push( polygon[ 0 ] )
        return JSON.stringify( polygon )
    }
    
    var fromDate = new Date()
    fromDate.setMonth( 0 )
    fromDate.setDate( 1 )
    var fromDatePicker = createDatePicker( $( '#from-date' )[ 0 ], fromDate )
    var toDatePicker   = createDatePicker( $( '#to-date' )[ 0 ], new Date() )
    $( '#target-day-of-year' ).val( dayOfYear() )
    
    function preview( mapIndex ) {
        var iso     = $( '#countries' ).val()
        var sensors = []
        $( '#sensors' ).find( 'input:checked' ).each( function () {
            sensors.push( $( this ).attr( 'id' ) )
        } )
        sensors                   = sensors.join( ',' )
        var fromDate              = fromDatePicker.getDate().getTime()
        var toDate                = toDatePicker.getDate().getTime()
        var targetDayOfYear       = $( '#target-day-of-year' ).val()
        var targetDayOfYearWeight = $( '#target-day-of-year-weight' ).val()
        var bands                 = $( '#bands' + mapIndex ).val()
        var exportImage           = $( '#exportImage' ).prop( 'checked' )
        var path                  = exportImage ? 'export' : 'preview'
        
        var query = {
            fusionTable          : '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F',
            keyColumn            : 'ISO',
            keyValue             : iso,
            sensors              : sensors,
            fromDate             : fromDate,
            toDate               : toDate,
            targetDayOfYear      : targetDayOfYear,
            targetDayOfYearWeight: targetDayOfYearWeight,
            bands                : bands
        }
        if ( shape != null )
            query.polygon = createPolygon()
        $.getJSON( path, query,
            function ( data ) {
                var mapId  = data.mapId
                var token  = data.token
                var bounds = data.bounds
                render( mapId, token, bounds, mapIndex )
            } )
    }
    
    function previewScenes( mapIndex ) {
        var iso                   = $( '#countries' ).val()
        var sceneIds              = $( '#sceneIds' ).val().split( '\n' ).join( ',' )
        var bands                 = $( '#bands' + mapIndex ).val()
        var targetDayOfYear       = $( '#target-day-of-year' ).val()
        var targetDayOfYearWeight = $( '#target-day-of-year-weight' ).val()
        var path                  = 'preview-scenes'
        
        var query = {
            fusionTable          : '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F',
            keyColumn            : 'ISO',
            keyValue             : iso,
            sceneIds             : sceneIds,
            targetDayOfYear      : targetDayOfYear,
            targetDayOfYearWeight: targetDayOfYearWeight,
            bands                : bands
        }
        if ( shape != null )
            query.polygon = createPolygon()
        $.getJSON( path, query,
            function ( data ) {
                var mapId  = data.mapId
                var token  = data.token
                var bounds = data.bounds
                render( mapId, token, bounds, mapIndex )
            } )
        
    }
    
    function render( mapId, token, bounds, mapIndex ) {
        var eeMapOptions = {
            getTileUrl: function ( tile, zoom ) {
                var baseUrl = 'https://earthengine.googleapis.com/map'
                var url     = [ baseUrl, mapId, zoom, tile.x, tile.y ].join( '/' )
                url += '?token=' + token
                return url
            },
            tileSize  : new google.maps.Size( 256, 256 )
        }
        
        // Create the map type.
        var map     = maps[ mapIndex - 1 ]
        var mapType = new google.maps.ImageMapType( eeMapOptions )
        map.overlayMapTypes.clear()
        map.overlayMapTypes.push( mapType )
        
        
        var latLngBounds = new google.maps.LatLngBounds()
        for ( var i = 0; i < 4; i++ ) {
            var latLng = bounds[ i ]
            latLngBounds.extend( new google.maps.LatLng( latLng[ 1 ], latLng[ 0 ] ) )
        }
        map.fitBounds( latLngBounds )
    }
    
    function createDatePicker( field, date ) {
        var initialized = false
        var datePicker  = new Pikaday( {
            field      : field,
            defaultDate: date
        } )
        datePicker.setDate( date )
        return datePicker
    }
    
    function dayOfYear() {
        var now    = new Date();
        var start  = new Date( now.getFullYear(), 0, 0 );
        var diff   = now - start;
        var oneDay = 1000 * 60 * 60 * 24;
        return Math.floor( diff / oneDay );
    }
})()
