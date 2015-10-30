function MapService(map) {
    this.setMarkers = setMarkers;
    this.renderPolygons = renderPolygons;
    this.resetMap = resetMap;
    this.onLatLngUpdate = function (listener) {
        latLngListener = listener;
    };

    var markers = [];
    var boundsRectangle;
    var multiPolygon;
    var latLngListener;

    init(map);

    function init(theMap) {
        map = theMap;
        var options = {
            minZoom: 2,
            maxZoom: 15,
            drawControl: true
        };
        L.Util.setOptions(map, options);
        map.setView([0, 0], 2);

        map.on('click', function (event) {
            addMarker(event.latlng);
        });
    }

    function addMarker(latlng) {
        if (boundsRectangle || multiPolygon)
            resetMap();

        latlng = L.latLng(latlng).wrap();
        var marker = L.marker(latlng);
        markers.push(marker);

        if (markers.length == 2)
            drawBounds();

        marker.addTo(map);
        notifyLatLngListener();
    }

    function resetMap() {
        _.each(markers, function (markerToRemove) {
            map.removeLayer(markerToRemove);
        });
        markers = [];
        if (boundsRectangle)
            map.removeLayer(boundsRectangle);
        if (multiPolygon)
            map.removeLayer(multiPolygon);
        boundsRectangle = null;
        multiPolygon = null;
    }

    function drawBounds() {
        boundsRectangle = createBounds(markers);
        var fromToCorners = determineFromToCorners(markers, boundsRectangle);

        boundsRectangle.on('editstart', function () {
            _.each(markers, function (markerToRemove) {
                map.removeLayer(markerToRemove);
            });
        });

        boundsRectangle.on('edit', function () {
            var latLngs = boundsRectangle.getLatLngs();
            _.each(fromToCorners, function (corner) {
                addMarker(latLngs[corner]);
            });
        });
    }

    function createBounds(markers) {
        var bounds = [markers[0].getLatLng(), markers[1].getLatLng()];
        var boundsRectangle = L.rectangle(bounds, {color: "#ff7800", weight: 1}).addTo(map);
        boundsRectangle.editing.enable();
        return boundsRectangle;
    }

    function determineFromToCorners(markers, rectangle) {
        var firstCorner = rectangle.getLatLngs()[0];
        var markerOnFirstCorner = _.find(markers, function (marker) {
            return _.isEqual(marker.getLatLng(), firstCorner);
        });
        var fromToCorners = markerOnFirstCorner ? [0, 2] : [1, 3];
        if (!_.isEqual(markers[0].getLatLng(), rectangle.getLatLngs()[fromToCorners[0]]))
            fromToCorners = fromToCorners.reverse();
        return fromToCorners;
    }

    function setMarkers(latLngs) {
        resetMap();
        _.each(latLngs, function (latLng) {
            addMarker(latLng);
        });
        map.fitBounds(latLngs, {
            maxZoom: map.getZoom()
        });
    }

    function renderPolygons(polygons) {
        resetMap();
        var p = _.map(polygons, function (polygon) {
            return _.map(pairs(polygon), function (latLng) {
                return L.latLng(latLng[0], latLng[1]);
            });
        });
        multiPolygon = L.multiPolygon(p, {
            weight: 1
        }).addTo(map);
        map.fitBounds(multiPolygon, {
            maxZoom: map.getZoom()
        });
    }

    function pairs(array) {
        var pairs = [];
        _.times(array.length / 2, function (n) {
            pairs.push([array[2 * n], array[2 * n + 1]]);
        });
        return pairs;
    }

    function notifyLatLngListener() {
        if (latLngListener) {
            var fromLatLng = markers[0] ? markers[0].getLatLng() : null;
            var toLatLng = markers[1] ? markers[1].getLatLng() : null;
            latLngListener(fromLatLng, toLatLng);
        }
    }
}