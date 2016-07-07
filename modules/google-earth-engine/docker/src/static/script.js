(function () {
    var map = new google.maps.Map(
        document.getElementById( 'map' ), {
            // maxZoom: 10,
            streetViewControl: false
        } )
    
    $( '#form' ).submit( function ( e ) {
        e.preventDefault()
        preview()
    } )
    
    $( '#sceneIdForm' ).submit( function ( e ) {
        e.preventDefault()
        previewScenes()
    } )
    
    var fromDate         = new Date()
    fromDate.setMonth( 0 )
    fromDate.setDate( 1 )
    var fromDatePicker = createDatePicker( $( '#from-date' )[ 0 ], fromDate )
    var toDatePicker = createDatePicker( $( '#to-date' )[ 0 ], new Date() )
    $('#target-day-of-year').val(dayOfYear())
    
    function preview() {
        console.log( 'Preview' )
        var country = $( '#countries' ).val()
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
                country        : country,
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
        $.getJSON( 'scenes-in-mosaic', { country: country, targetDate: targetDate, sensors: sensors, years: years, bands: bands },
            function ( data ) {
                $( '#scenes-in-mosaic' ).html( data.join( '<br/>' ) )
            } )
    }
    
    function previewScenes() {
        console.log( 'Preview scenes' )
        var scenes = $( '#sceneIds' ).val().split( '\n' ).join( ',' )
        var bands  = $( '#bands' ).val()
        
        $.getJSON( 'preview-scenes', { scenes, bands },
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
        var now = new Date();
        var start = new Date(now.getFullYear(), 0, 0);
        var diff = now - start;
        var oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
    }
})()
