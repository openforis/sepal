(function () {
    var map      = new google.maps.Map(
        document.getElementById( 'map' ), {
            zoom              : 3,
            minZoom           : 3,
            maxZoom           : 11,
            center            : new google.maps.LatLng( 16.7794913, 9.6771556 ),
            mapTypeId         : google.maps.MapTypeId.ROADMAP,
            zoomControl       : true,
            zoomControlOptions: {
                position: google.maps.ControlPosition.RIGHT_CENTER
                , style : google.maps.ZoomControlStyle.LARGE
            },
            mapTypeControl    : false,
            scaleControl      : false,
            streetViewControl : false,
            rotateControl     : false,
            fullscreenControl : false
        } )
    $( '#form' ).submit( function ( e ) {
        e.preventDefault()
        preview()
    } )
    
    $( '#sceneIdForm' ).submit( function ( e ) {
        e.preventDefault()
        previewScenes()
    } )
    
    var fromDate = new Date()
    fromDate.setMonth( 0 )
    fromDate.setDate( 1 )
    var fromDatePicker = createDatePicker( $( '#from-date' )[ 0 ], fromDate )
    var toDatePicker   = createDatePicker( $( '#to-date' )[ 0 ], new Date() )
    $( '#target-day-of-year' ).val( dayOfYear() )
    
    function preview() {
        console.log( 'Preview' )
        var iso     = $( '#countries' ).val()
        var sensors = []
        $( '#sensors' ).find( 'input:checked' ).each( function () {
            sensors.push( $( this ).attr( 'id' ) )
        } )
        sensors             = sensors.join( ',' )
        var fromDate        = fromDatePicker.getDate().getTime()
        var toDate          = toDatePicker.getDate().getTime()
        var targetDayOfYear = $( '#target-day-of-year' ).val()
        var fromDayOfYear   = $( '#from-day-of-year' ).val()
        var toDayOfYear     = $( '#to-day-of-year' ).val()
        var bands           = $( '#bands' ).val()
        
        $.getJSON( 'preview', {
                fusionTable    : '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F',
                keyColumn      : 'ISO',
                keyValue       : iso,
                sensors        : sensors,
                fromDate       : fromDate,
                toDate         : toDate,
                targetDayOfYear: targetDayOfYear,
                fromDayOfYear  : fromDayOfYear,
                toDayOfYear    : toDayOfYear,
                bands          : bands
            },
            function ( data ) {
                var mapId  = data.mapId
                var token  = data.token
                var bounds = data.bounds
                render( mapId, token, bounds )
            } )
        
        $( '#scenes-in-mosaic' ).html( 'Determining scenes used in mosaic...' )
        $.getJSON( 'scenes-in-mosaic', {
                fusionTable    : '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F',
                keyColumn      : 'ISO',
                keyValue       : iso,
                sensors        : sensors,
                fromDate       : fromDate,
                toDate         : toDate,
                targetDayOfYear: targetDayOfYear,
                fromDayOfYear  : fromDayOfYear,
                toDayOfYear    : toDayOfYear
            },
            function ( data ) {
                $( '#scenes-in-mosaic' ).html( data.join( '<br/>' ) )
            } )
    }
    
    function previewScenes() {
        console.log( 'Preview scenes' )
        var iso             = $( '#countries' ).val()
        var scenes          = $( '#sceneIds' ).val().split( '\n' ).join( ',' )
        var bands           = $( '#bands' ).val()
        var targetDayOfYear = $( '#target-day-of-year' ).val()
        var fromDate        = fromDatePicker.getDate().getTime()
        var toDate          = toDatePicker.getDate().getTime()
        
        $.getJSON( 'preview-scenes', {
                fusionTable    : '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F',
                keyColumn      : 'ISO',
                keyValue       : iso,
                scenes         : scenes,
                targetDayOfYear: targetDayOfYear,
                bands          : bands,
                fromDate       : fromDate,
                toDate         : toDate
            },
            function ( data ) {
                var mapId  = data.mapId
                var token  = data.token
                var bounds = data.bounds
                render( mapId, token, bounds )
            } )
        
    }
    
    function render( mapId, token, bounds ) {
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
        var mapType = new google.maps.ImageMapType( eeMapOptions )
        map.overlayMapTypes.clear()
        map.overlayMapTypes.push( mapType )
        
        
        var latLngBounds = new google.maps.LatLngBounds()
        for ( var i = 0; i < 4; i++ ) {
            var latLng = bounds[ i ]
            console.log( latLng )
            latLngBounds.extend( new google.maps.LatLng( latLng[ 1 ], latLng[ 0 ] ) )
        }
        map.fitBounds( latLngBounds )
    }
    
    function createDatePicker( field, date ) {
        var initialized = false
        var datePicker  = new Pikaday( {
            field      : field,
            defaultDate: date,
            onSelect   : function () { if ( initialized ) preview }
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
