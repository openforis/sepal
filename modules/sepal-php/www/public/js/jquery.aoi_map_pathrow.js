/*
* Title:  aoi_map_pathrow 0.0.1
* Dependencies:  jQuery 1.3.2 + (jquery.js)
*      jQueryUI 1.7+ (jquery.ui/ui/*.js)
*      jquery.util.toDecimalDeg.js

*      jquery.ui/themes/base/ui.all.css
*      jquery.ui/ui/ui.core.js
*      jquery.ui/ui/ui.datepicker.js
*      jquery.ui/ui/ui.draggable.js
*      jquery.ui/ui/ui.resizable.js
*      jquery.ui/ui/ui.dialog.js
*      Google Maps API (version 2 or above)
* Author:  Jo Wahle
* CAUTION:
*      This script uses LANDSAT ETM for test purposes, launched April 15, 1999
#      FIX sensorName AND launchDate AND launchDateString BEFORE LAUNCH
*
* 2/23/2009
*/

var homeCoords = [43.73597,-96.62542];
var latitudeRangeGoogleMap = [-85, 85];
var defaultZoomLevel = 3;
var defaultMapType = google.maps.MapTypeId.HYBRID;
var strokeColor = "#000000";
var strokeWeight = 2;
var strokeOpacity = 1;
var fillColor = "#0000FF";
var fillOpacity = 0.35;

var map;
var latLng1IsSet = false;
var latLng2IsSet = false;
var marker1;
var marker2;
var polygon;

var dragableIsSet = true;


(function($) {
    $.fn.Mresize = function() {
        google.maps.event.trigger(map, "resize");

    }
})(jQuery);

(function($) {
	$.fn.mapCenter = function() {
		map.setCenter(new google.maps.LatLng(homeCoords[0], homeCoords[1]), defaultZoomLevel);
	}
})(jQuery);

(function($) {
    $.fn.mapRefresh = function() {

    if (($("#lat1").val() == "")) {
        return;
    }

    var decLat1 = $.toDecimalDeg($("#lat1").val(), "latitude", { range:latitudeRangeGoogleMap });
    var decLng1 = $.toDecimalDeg($("#long1").val(), "longitude");
    var decLatLng1 = new google.maps.LatLng(decLat1, decLng1);

    map.setCenter(new google.maps.LatLng($("#lat1").val(), $("#long1").val()), defaultZoomLevel);

    if (($("#lat2").val() == "")) {
        $.drawPlainMarker(decLatLng1, true);
        latLng1IsSet = true;
        latLng2IsSet = false;
    }
    else {
        var decLat2 = $.toDecimalDeg($("#lat2").val(), "latitude", { range:latitudeRangeGoogleMap });
        var decLng2 = $.toDecimalDeg($("#long2").val(), "longitude");
        var decLatLng2 = new google.maps.LatLng(decLat2, decLng2);

        $.drawPlainMarker(decLatLng1, false);
        $.drawPlainPolygon(decLatLng2);
        latLng1IsSet = true;
        latLng2IsSet = true;
    }

    }
})(jQuery);

(function($) {
    $.updateMouseLocation = function(newLatLng) {
        if (newLatLng !== undefined) {
            $("#mouseLatLng").html(newLatLng.toString());
        }
        else {
            $("#mouseLatLng").html('&nbsp;');
        }
    }
})(jQuery);

(function($) {
    $.updateAoi = function(newLatLng) {
        if (latLng1IsSet && latLng2IsSet) {
            // clear out both points and start over
            $.clearAoiRectangle();

            $("#lat1").val('');
            $("#long1").val('');
            $("#lat2").val('');
            $("#long2").val('');
            $("#latLong1Notice").text('');
            $("#latLong2Notice").text('');

            latLng1IsSet = false;
            latLng2IsSet = false;
        }

        if (!latLng1IsSet) {
            // add a plain marker at the indicated position
            $.drawPlainMarker(newLatLng, true);

            // update lat/long form fields in case this was called from click
            $("#lat1").val(new Number(newLatLng.lat()).toFixed(5));
            $("#long1").val(new Number(newLatLng.lng()).toFixed(5));

            // make sure lat/long is visible in case this was called from boxes
            $.panIfNeeded(newLatLng);

            $("#latLong1Notice").text('');

            latLng1IsSet = true;
        }
        else {
            // The Google Maps API will only draw polygons < 180 degrees wide
            // (otherwise it wraps around the earth the other direction)
            // We also want to guard against crossing the 180/-180 meridian
            if (Math.abs(newLatLng.lng() - marker1.getPosition().lng()) > 180) {
                alert("Please select an area less than 180 degrees wide "
                    + "that does not cross the 180/-180 meridian");
                return;
            }

            // draw polygon using existing marker & newLatLng
            // but do not display markers

            $.clearPlainMarker();
            $.drawPlainPolygon(newLatLng);

            // update lat/long form fields in case this was called from click
            $("#lat2").val(new Number(newLatLng.lat()).toFixed(5));
            $("#long2").val(new Number(newLatLng.lng()).toFixed(5));

            // make sure lat/long is visible in case this was called from boxes
            $.panIfNeeded(newLatLng);

            if (/\(Point 2 moved up\)/.test($("#latLong1Notice").text())) {
                $("#latLong1Notice").text('');
            }
            $("#latLong2Notice").text('');

            latLng2IsSet = true;
            if ($.updateBboxFromMap != undefined)
                $.updateBboxFromMap();
        }
    }
})(jQuery);

(function($) {
    $.panIfNeeded = function(latlng) {
        // if lat/lng is not within visible area, pan to it (else no panning)
        var mapBounds = map.getBounds();

        if (!mapBounds.contains(latlng)) {
            map.panTo(latlng);
        }

        // TODO: if whole rectangle can be shown at current zoom level,
        // pan to the whole rectangle instead of the current location
    }
})(jQuery);

(function($) {
    $.drawPlainMarker = function(latlng, showMarker) {
        if ((marker1 == undefined) || (marker1 == "")) {
            marker1 = $.createMarker(latlng);
        }
        else {
            marker1.setPosition(latlng);
        }

        if (showMarker) {
			marker1.setMap(map);
        }
    }
})(jQuery);

(function($) {
    $.clearPlainMarker = function() {
        if ((marker1 != undefined) && (marker1 != "")) {
			marker1.setMap(null);
        }
    }
})(jQuery);

(function($) {
    $.createMarker = function (latlng) {
        // set any default options here in a markerOptions object
        var marker = new google.maps.Marker();
		marker.setPosition(latlng);
		return marker;
    }
})(jQuery);

(function($) {
    $.drawPlainPolygon = function(latlng) {
        // create a marker to save its latlng
        if ((marker2 == undefined) || (marker2 == "")) {
            marker2 = $.createMarker(latlng);
        }
        else {
            marker2.setPosition(latlng);
        }

        // don't show the marker on the map, in fact, don't show either one

        // draw a rectangle using the two markers
        $.drawAoiRectangle(marker1.getPosition(), marker2.getPosition());
    }
})(jQuery);

(function($) {
    $.drawAoiRectangle = function(latLng1, latLng2) {
		var options = {
		clickable: false,
		fillColor: fillColor,
		fillOpacity: fillOpacity,
		strokeColor: strokeColor,
		strokeWeight: strokeWeight,
		strokeOpacity: strokeOpacity,
		paths: [latLng1,
            new google.maps.LatLng(latLng1.lat(), latLng2.lng()),
            latLng2,
            new google.maps.LatLng(latLng2.lat(), latLng1.lng()),
            latLng1
        ]};
        polygon = new google.maps.Polygon(options);
        polygon.setMap(map);
    }
})(jQuery);

(function($) {
    $.clearAoiRectangle = function() {
        if ((polygon != undefined && polygon != "")) {
			polygon.setMap(null);
        }
    }
})(jQuery);

//Workaround function so that IE will work correctly when dragging from within a polygon
//Author: Dames. Date: Oct 7, 09
(function($) {
    $.dragable_overlay = function () {
		if ((polygon != undefined && polygon != "")) {
			polygon.setMap(null);
			polygon.setMap(map);
        }
    }
})(jQuery);

(function($) {
    $.deletePoint1 = function() {
        if (latLng2IsSet) {
            $.clearAoiRectangle();

            // install Point 2 as Point 1
            $("#lat1").val($("#lat2").val());
            $("#long1").val($("#long2").val());
            $("#lat2").val('');
            $("#long2").val('');
            $("#latLong1Notice").text('(Point 2 moved up)');
            $("#latLong2Notice").text('');

            $.drawPlainMarker(marker2.getPosition(), true); // updates marker1

            $.panIfNeeded(marker1.getPosition());

            latLng1IsSet = true;
            latLng2IsSet = false;
        }
        else {
            $.clearPlainMarker();
            $("#lat1").val('');
            $("#long1").val('');
            $("#latLong1Notice").text('');

            latLng1IsSet = false;
        }
    }
})(jQuery);

(function($) {
    $.deletePoint2 = function() {
        $.clearAoiRectangle();
        $("#lat2").val('');
        $("#long2").val('');
        $("#latLong2Notice").text('');

        if (latLng1IsSet) {
            $.drawPlainMarker(marker1.getPosition(), true);

            $.panIfNeeded(marker1.getPosition());
        }

        latLng2IsSet = false;
    }
})(jQuery);

// main function to synchronize the AOI entry with the Google Map
(function($) {
$.fn.aoi_map_pathrow = function(options) {

    // Add the map
    var options = {
        mapTypeId: defaultMapType,
	zoom: defaultZoomLevel,
	center: new google.maps.LatLng(homeCoords[0], homeCoords[1]),
	overviewMapControl: true,
	overviewMapControlOptions:{
            opened: false
            },
        streetViewControl: false,
        overviewMapControl: true,
        zoomControl: true,
        zoomControlOptions: {
	    style: google.maps.ZoomControlStyle.SMALL
	},
	mapTypeControl: true,
	mapTypeControlOptions: {
	    style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
            position: google.maps.ControlPosition.TOP_RIGHT
	},
	minZoom: 2

    };
        

    var mapContainer = document.getElementById("map_canvas");
    map = new google.maps.Map(mapContainer, options);

    google.maps.event.addListener(map, "mousemove", function(event) {
        $.updateMouseLocation(event.latLng);
    });
    google.maps.event.addListener(map, "mouseout", function(event) {
        $.updateMouseLocation();
    });
    google.maps.event.addListener(map, "click", function(event) {
    //workaround for IE erroring when dragging w/ AOI box up.
	if ((latLng1IsSet && latLng2IsSet)) {
		$.dragable_overlay();
	}
			
	if (event.latLng) {
                $.updateAoi(event.latLng);
        }


    });
    //workaround for IE to make the polygon able to be draggable. 
    google.maps.event.addListener(map, "dragstart", function(event) {
	if(  (latLng1IsSet && latLng2IsSet) && dragableIsSet)
		$.dragable_overlay();
    });


    // update the map based on the text boxes
    $("#applyLatLong1").click(function() {
        // if empty, invoke delete and move marker2 into 1
        if (($("#lat1").val() == "") && ($("#long1").val() == "")) {
            $.deletePoint1();
            return;
        }

        // get decimal degrees in case user entered degrees minutes seconds
        var decLat1 = $.toDecimalDeg($("#lat1").val(), "latitude", { range:latitudeRangeGoogleMap });
        var decLng1 = $.toDecimalDeg($("#long1").val(), "longitude");
        if (!decLat1 || !decLng1) {
            alert("Invalid coordinate");
            return;
        }
        var decLatLng = new google.maps.LatLng(decLat1, decLng1);



        if (latLng2IsSet) {
            // The Google Maps API will only draw polygons < 180 degrees wide
            // (otherwise it wraps around the earth the other direction)
            // We also want to guard against crossing the 180/-180 meridian
            if (Math.abs(decLatLng.lng() - marker2.getPosition().lng()) > 180) {
                alert("Please select an area less than 180 degrees wide "
                    + "that does not cross the 180/-180 meridian");
                return;
            }

            $.clearAoiRectangle();
            $.drawPlainMarker(decLatLng, false); // do not show marker1
            $.drawAoiRectangle(decLatLng, marker2.getPosition());
        }
        else {
            $.clearPlainMarker();
            $.drawPlainMarker(decLatLng, true);
        }

        // make sure lat/long is visible
        $.panIfNeeded(decLatLng);

        $("#latLong1Notice").text('');
		
		latLng1IsSet = true;
    });

    $("#applyLatLong2").click(function() {
        // if empty, invoke delete and remove polygon, draw marker1
        if (($("#lat2").val() == "") && ($("#long2").val() == "")) {
            $.deletePoint2();
            return;
        }

        // get decimal degrees in case user entered degrees minutes seconds
        var decLat2 = $.toDecimalDeg($("#lat2").val(), "latitude", { range: latitudeRangeGoogleMap });
        var decLng2 = $.toDecimalDeg($("#long2").val(), "longitude");
        if (!decLat2 || !decLng2) {
            alert("Invalid coordinate");
            return;
        }
        var decLatLng = new google.maps.LatLng(decLat2, decLng2);

        if (latLng1IsSet) {
            // The Google Maps API will only draw polygons < 180 degrees wide
            // (otherwise it wraps around the earth the other direction)
            // We also want to guard against crossing the 180/-180 meridian
            if (Math.abs(decLatLng.lng() - marker1.getPosition().lng()) > 180) {
                alert("Please select an area less than 180 degrees wide "
                    + "that does not cross the 180/-180 meridian");
                return;
            }

            $.clearPlainMarker();
            $.clearAoiRectangle();
            $.drawPlainPolygon(decLatLng);

            latLng2IsSet = true;
        }
        else {
            // Oops, nothing in latLng1, so set that instead

            // install Point 2 as Point 1
            $("#lat1").val($("#lat2").val());
            $("#long1").val($("#long2").val());
            $("#lat2").val('');
            $("#long2").val('');
            $("#latLong1Notice").text('(Point 2 moved up)');

            $.clearPlainMarker();
            $.drawPlainMarker(decLatLng, true);

            latLng1IsSet = true;
            latLng2IsSet = false;
        }

        // make sure lat/long is visible
        $.panIfNeeded(decLatLng);

        $("#latLong2Notice").text('');
    });

    $("#clearLatLong1").click(function() {
        $.deletePoint1();
    });

    $("#clearLatLong2").click(function() {
        $.deletePoint2();
    });

    $("#lat1, #long1").change(function() {
        $("#latLong1Notice").text('Coordinates have changed');
    });

    $("#lat2, #long2").change(function() {
        $("#latLong2Notice").text('Coordinates have changed');
    });

} // end of aoi_map_pathrow function
})(jQuery);




