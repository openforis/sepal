(function () {
    var map = new google.maps.Map(
        document.getElementById('map'), {
            // maxZoom: 10,
            streetViewControl: false
        })

    $('#form').submit(function (e) {
        e.preventDefault()
        updateMap()
    })

    var datePicker = createDatePicker($('#target-date')[0], new Date())


    function updateMap() {
        console.log('Updating map')
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
            onSelect: function() { if (initialized) updateMap }
        })
        datePicker.setDate(date)
        return datePicker
    }
})()
