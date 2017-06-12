var mapUtils = {
    L: {
        drawSquare: function(latLng, side, options, map, draw) {
            var circle = L.circle(latLng, {
                radius: side / 2
            }).addTo(map);
            var square = L.rectangle(circle.getBounds());
            if (draw === undefined || draw == false) square.setStyle({
                color: 'transparent'
            });
            else if (options !== undefined) square.setStyle(options);
            square.addTo(map);
            return square;
        },
        drawPoint: function(latLng, options, map) {
            var point = L.circle(latLng, {
                radius: 1
            });
            if (options !== undefined) point.setStyle(options);
            point.addTo(map);
            return point;
        },
        cloneSquare: function(gSquare, options, map) {
            var latLngBounds = L.latLngBounds([
                [gSquare.getBounds().getNorthEast().lat(), gSquare.getBounds().getNorthEast().lng()],
                [gSquare.getBounds().getSouthWest().lat(), gSquare.getBounds().getSouthWest().lng()]
            ]);
            var square = L.rectangle(latLngBounds);
            if (options !== undefined) square.setStyle(options);
            square.addTo(map);
            return square;
        }
    },
    G: {
        drawSquare: function(latLng, side, options, map) {
            var circle = new google.maps.Circle({
                center: latLng,
                radius: side / 2
            });
            var square = new google.maps.Rectangle({
                bounds: circle.getBounds()
            });
            if (options !== undefined) square.setOptions(options);
            if (map !== undefined) square.setMap(map);
            return square;
        },
        drawPoint: function(latLng, options, map) {
            var point = new google.maps.Circle({
                center: latLng,
                radius: 1
            });
            if (options !== undefined) point.setOptions(options);
            if (map !== undefined) point.setMap(map);
            return point;
        }
    },
    utils: {
        switchToGoogleMaps: function(gmap, lmap, gmapElementId, lmapElementId) {
            if ($('#' + gmapElementId).is(":hidden")) {
                gmap.setZoom(lmap.getZoom());
                gmap.setCenter(new google.maps.LatLng(lmap.getCenter()['lat'], lmap.getCenter()['lng']));
                $('#' + gmapElementId).show();
                $('#' + lmapElementId).hide();
                google.maps.event.trigger(gmap, 'resize');
            }
        },
        switchToLeaflet: function(gmap, lmap, gmapElementId, lmapElementId) {
            if ($('#' + lmapElementId).is(":hidden")) {
                lmap.setZoom(gmap.getZoom());
                lmap.panTo(new L.LatLng(gmap.getCenter().lat(), gmap.getCenter().lng()));
                $('#' + gmapElementId).hide();
                $('#' + lmapElementId).show();
                lmap.invalidateSize();
            }
        }
    }
}
