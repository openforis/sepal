(function () {
    var map = new google.maps.Map(
        document.getElementById('map'), {
            zoom: 3,
            minZoom: 3,
            maxZoom: 11,
            center: new google.maps.LatLng( 16.7794913, 9.6771556 ),
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            zoomControl: true,
            zoomControlOptions: {
                position: google.maps.ControlPosition.RIGHT_CENTER
                , style: google.maps.ZoomControlStyle.LARGE
            },
            mapTypeControl: false,
            scaleControl: false,
            streetViewControl: false,
            rotateControl: false,
            fullscreenControl: false,
            backgroundColor: '#131314'
        })
    var mapStyle = [
        {
            "stylers": [ { "visibility": "simplified" } ]
        }
        , {
            "stylers": [ { "color": "#131314" } ]
        }
        , {
            "featureType": "water",
            "stylers"    : [ { "color": "#131313" }, { "lightness": 4 }
            ]
        }
        , {
            "elementType": "labels.text.fill"
            , "stylers"  : [ { "visibility": "off" }, { "lightness": 25 } ]
        }
    ]
    map.setOptions( { styles: mapStyle } )

    $('#form').submit(function (e) {
        e.preventDefault()
        preview()
    })

    $('#sceneIdForm').submit(function (e) {
        e.preventDefault()
        previewScenes()
    })

    var datePicker = createDatePicker($('#target-date')[0], new Date())

    function preview() {
        console.log('Preview')
        var country = $('#countries').val()
        var targetDate = datePicker.getDate().getTime()
        var sensors = []
        $('#sensors').find('input:checked').each(function() {
            sensors.push($(this).attr('id'))
        })
        sensors = sensors.join(',')
        var years = $('#years').val()
        var bands = $('#bands').val()
        
        $.getJSON('preview', {country: country, targetDate: targetDate, sensors: sensors, years: years, bands: bands},
            function (data) {
                var mapId = data.mapId
                var token = data.token
                var bounds = data.bounds
                render(mapId, token, bounds)
        })
        
        $('#scenes-in-mosaic').html('Determining scenes used in mosaic...')
        $.getJSON('scenes-in-mosaic', {country: country, targetDate: targetDate, sensors: sensors, years: years, bands: bands},
            function (data) {
                $('#scenes-in-mosaic').html(data.join( '<br/>'))
        })
    }

    function previewScenes() {
        console.log('Preview scenes')
        var scenes = $('#sceneIds').val().split('\n').join(',')
        var bands = $('#bands').val()
        
        $.getJSON('preview-scenes', {scenes, bands},
            function (data) {
                var mapId = data.mapId
                var token = data.token
                var bounds = data.bounds
                render(mapId, token, bounds)
        })
        
    }

    function render(mapId, token, bounds) {
        var eeMapOptions = {
            getTileUrl: function (tile, zoom) {
                var baseUrl = 'https://earthengine.googleapis.com/map'
                var url = [baseUrl, mapId, zoom, tile.x, tile.y].join('/')
                url += '?token=' + token
                return url
            },
            tileSize: new google.maps.Size(256, 256)
        }

        // Create the map type.
        var mapType = new google.maps.ImageMapType(eeMapOptions)
        map.overlayMapTypes.clear()
        map.overlayMapTypes.push(mapType)


        var latLngBounds = new google.maps.LatLngBounds()
        for (var i = 0; i < 4; i++) {
            var latLng = bounds[i]
            console.log(latLng)
            latLngBounds.extend(new google.maps.LatLng(latLng[1], latLng[0]))
        }
        map.fitBounds(latLngBounds)
    }

    function createDatePicker(field, date) {
        var initialized = false
        var datePicker = new Pikaday({
            field: field,
            defaultDate: date,
            onSelect: function() { if (initialized) preview }
        })
        datePicker.setDate(date)
        return datePicker
    }
})()
