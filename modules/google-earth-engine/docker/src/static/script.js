(function () {
    var map = new google.maps.Map(
        document.getElementById('map'), {
            // maxZoom: 10,
            streetViewControl: false
        })

    $('select.map-config').change(function () {
        updateMap()
    })

    datePicker($('#from-date')[0], new Date(2013))
    datePicker($('#to-date')[0], new Date())


    function updateMap() {
        console.log('Updating map')
        var country = $('#countries').val()
        var bands = $('#bands').val()
        $.getJSON('map', {country: country, bands: bands}, function (data) {
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

    function datePicker(field, date) {
        var initialized = false
        var datePicker = new Pikaday({
            field: field,
            defaultDate: date,
            onSelect: function() { if (initialized) updateMap }
        })
        datePicker.setDate(date)
        return datePicker
    }
})()
