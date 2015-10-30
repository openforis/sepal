$(function () {
    var worldBounds = L.latLngBounds([-90, -180], [90, 180]);

    map = L.map('map-canvas', {
        maxBounds: worldBounds
    });



    L.tileLayer.wms('http://rdc-snsf.org//diss_geoserver/gwc/service/wms', {
        layers: ['unredd:blue_marble'],
        format: 'image/png',
        transparent: true
    }).addTo(map);

    //L.tileLayer.wms('http://data.fao.org/maps/wms', {
    //    layers: ['COMMON:hyp_hr_sr_ob_dr'],
    //    format: 'image/png',
    //    transparent: true
    //}).addTo(map);

    //new L.TileLayer.WMS("http://maps.opengeo.org/geowebcache/service/wms", {
    //    layers: 'bluemarble',
    //    attribution: "Data &copy; NASA Blue Marble, image service by OpenGeo",
    //    minZoom: 0,
    //    maxZoom: 5
    //}).addTo(map);

    //L.tileLayer('http://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    //    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    //}).addTo(map);
    ////
    L.tileLayer('http://otile{s}.mqcdn.com/tiles/1.0.0/{type}/{z}/{x}/{y}.{ext}', {
        type: 'hyb',
        ext: 'png',
        attribution: 'Tiles Courtesy of <a href="http://www.mapquest.com/">MapQuest</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: '1234',
        opacity: 0.9
    }).addTo(map);

    //var HERE_hybridDay = L.tileLayer('http://{s}.{base}.maps.cit.api.here.com/maptile/2.1/maptile/{mapID}/hybrid.day/{z}/{x}/{y}/256/png8?app_id={app_id}&app_code={app_code}', {
    //    attribution: 'Map &copy; 1987-2014 <a href="http://developer.here.com">HERE</a>',
    //    subdomains: '1234',
    //    mapID: 'newest',
    //    app_id: 'Y8m9dK2brESDPGJPdrvs',
    //    app_code: 'dq2MYIvjAotR8tHvY8Q_Dg',
    //    base: 'aerial',
    //    maxZoom: 20
    //}).addTo(map);

    //L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
    //    attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a>'
    //}).addTo(map);

    var mapService = new MapService(map);


    var wrsMessageBox = $('#wrs-msg-box');
    var latLngMessageBox = $('#latlng-msg-box');
    bindToForms();

    function bindToForms() {
        $("#pathrowId").click(function () {
            showPathRowPolygons();
        });
        $("#applyLatLong2").click(function () {
            setMarkers(true);
        });
        $("#lat1,#long1,#lat2,#long2").blur(function () {
            setMarkers(false);
        });

        mapService.onLatLngUpdate(function (fromLatLng, toLatLng) {
            if (fromLatLng) {
                $("#lat1").val(fromLatLng.lat);
                $("#long1").val(fromLatLng.lng);
            } else {
                $("#lat1").val('');
                $("#long1").val('');
            }
            if (toLatLng) {
                $("#lat2").val(toLatLng.lat);
                $("#long2").val(toLatLng.lng);
            } else {
                $("#lat2").val('');
                $("#long2").val('');
            }
        });


        $("input#search").click(function () {
            var lat1 = $.trim($("#lat1").val());
            var long1 =  $.trim($("#long1").val());
            var lat2 =  $.trim($("#lat2").val());
            var long2 =  $.trim($("#long2").val());

            if ($.trim(lat1) && $.trim(lat2) && $.trim(long1) && $.trim(long2)) {
                $("input[name='topLeftLatitude']").val(lat1);
                $("input[name='topLeftLongitude']").val(long1);
                $("input[name='bottomRightLatitude']").val(lat2);
                $("input[name='bottomRightLongitude']").val(long2);
            } else {
                $("input[name='topLeftLatitude']").val("");
                $("input[name='topLeftLongitude']").val("");
                $("input[name='bottomRightLatitude']").val("");
                $("input[name='bottomRightLongitude']").val("");

            }
        });
    }

    function setMarkers(displayError) {
        try {
            var fromLatLng = [$.trim($("#lat1").val()), $.trim($("#long1").val())];
            var toLatLng = [$.trim($("#lat2").val()), $.trim($("#long2").val())];
            var markers = [fromLatLng];
            if (toLatLng[0] || toLatLng[1])
                markers.push(toLatLng);
            if (worldBounds.contains(markers)) {
                mapService.setMarkers(markers);
                latLngMessageBox.html('');
            } else
                showLatLngError(true);
        } catch (err) {
            showLatLngError(displayError);
        }
    }

    function showLatLngError(displayError) {
        if (displayError)
            latLngMessageBox.html('' +
            '<p style="visibility: visible" class="error lat">' +
            'Longitude and Latitude should be numeric values, ' +
            'where latitude ranges from -90 to +90 and longitude ranges from -180 to 180. ' +
            'Either top left point or bottom right point should be specified' +
            '</p>');
    }

    function showPathRowPolygons() {
        wrsMessageBox.html('');
        var fromPath = $.trim($("#beginPath").val());
        var fromRow = $.trim($("#beginRow").val());
        var toPath = $.trim($("#endPath").val());
        var toRow = $.trim($("#endRow").val());

        try {
            validateWrsCoordinate(fromPath, fromRow);
            validateWrsCoordinate(toPath, toRow);
        } catch (error) {
            wrsMessageBox.html('' +
            '<p style="visibility: visible" class="error lat">' +
            'The WRS Paths/Rows should be integers. ' +
            'The row value ranges from 1 to 248 and path value ranges from 1 to 233. ' +
            'Path and row should be specified in pairs.' +
            '</p>');
            mapService.resetMap();
            return;
        }

        try {
            validateWrsFromToOrder(fromPath, fromRow, toPath, toRow);
        } catch (error) {
            wrsMessageBox.html('' +
            '<p style="visibility: visible" class="error lat">' +
            'When specified in multiple inputs, path/row input values must be supplied in ascending order. (i.e. 20 to 25).' +
            '</p>');
            mapService.resetMap();
            return;
        }

        $.ajax({
            data: {
                'beginpath': fromPath,
                'beginrow': fromRow,
                'endpath': toPath,
                'endrow': toRow
            },
            type: 'POST',
            url: "pathtolatlong",
            cache: false,
            success: function (data) {
                var polygons = JSON.parse(data);
                if (polygons.length >= 2500)
                    wrsMessageBox.html('' +
                    '<p style="visibility: visible" class="success path">' +
                    'Display of path/row boundaries are limited to a count of 2500. ' +
                    'This limitation is only on the drawn regions and the search will still use all of the provided information' +
                    '</p>');

                mapService.renderPolygons(polygons);
            }
        });
    }

    function validateWrsFromToOrder(fromPath, fromRow, toPath, toRow) {
        if (toPath && toRow && (fromPath > toPath || fromRow > toRow))
            throw 'From and to coordinate not in order';
    }

    function validateWrsCoordinate(path, row) {
        if (!path && !row)
            return;
        var pathInt = parseInt(path);
        var rowInt = parseInt(row);
        if (pathInt < 1 || pathInt > 233 || rowInt < 1 || rowInt > 248)
            throw 'Path or row out of range';
    }
});