// The markers are stored in an array.

var map;
var polygon;
var markers = [];
var marker1 = false;
var marker2 = false;
var marker;
var newpolygon = [];

var markerPos1 = "";

function initialize() {
    var haightDefault = new google.maps.LatLng(0, 0);
    var mapOptions = {
        zoom: 2,
        minZoom: 2,
        maxZoom: 15,
        center: haightDefault,
        streetViewControl: false,
        mapTypeId: google.maps.MapTypeId.HYBRID
    };
    map = new google.maps.Map(document.getElementById('map-canvas'),
        mapOptions);
    marker = new google.maps.Marker({
        map: map
    });

    // This event listener will call addMarker() when the map is clicked.
    google.maps.event.addListener(map, 'click', function (event) {
        var markercount = markers.length;
        var place;
        if (markercount == 0) {//when the first click on map, add the marker
            place = 'Location 1';
            $("#lat1").val("");
            $("#long1").val("");
            clearAoiRectangle();
            addMarker(event.latLng, place);
            getPlainMarkerPosition();

        } else if (markercount == 1) {//when second click on map, add the marker and polygon
            place = 'Location 2';
            addMarker(event.latLng, place);
            drawAoiRectangle();
            marker2 = true;
            marker2Object = markers[1].getPosition();
            $("#lat2").val(marker2Object.lat());
            $("#long2").val(marker2Object.lng());

        } else {//remove markers and polygons and adda new marker
            place = 'Location 1';
            deleteMarkers();
            clearAoiRectangle();
            addMarker(event.latLng, place);
            getPlainMarkerPosition();

        }


    });
    if (!google.maps.Polyline.prototype.getBounds) {
        google.maps.Polygon.prototype.getBounds = function () {
            var bounds = new google.maps.LatLngBounds();
            var path = this.getPath();
            for (var i = 0; i < path.getLength(); i++) {
                bounds.extend(path.getAt(i));
            }
            return bounds;
        }
    }

}
//add first marker
function getPlainMarkerPosition() {
    marker1 = true;
    marker2 = false;
    marker1Object = markers[0].getPosition();
    $("#lat1").val(marker1Object.lat());
    $("#long1").val(marker1Object.lng());
    $("#lat2").val("");
    $("#long2").val("");
}
// Add a marker to the map and push to the array.
function addMarker(location, place) {
    var marker = new google.maps.Marker({
        position: location,
        title: place,
        map: map
        //draggable : true //cant set drag event and bounds changed together
    });
    markers.push(marker);

    var infowindow = new google.maps.InfoWindow({
        content: place
    });
    google.maps.event.addListener(marker, 'click', function () {
        infowindow.open(map, marker);
    });
}

//fill the coordinate value in textbox
function fillCoordinates() {
    var latLng1 = markers[0].getPosition();
    var latLng2 = markers[1].getPosition();
    $("#lat1").val(latLng1.lat());
    $("#long1").val(latLng1.lng());
    $("#lat2").val(latLng2.lat());
    $("#long2").val(latLng2.lng());
}

//get first and second coordinates
function getPolygonBounds() {
    var latLng1 = markers[0].getPosition();
    var latLng2 = markers[1].getPosition();
    fillCoordinates();
    latMin = Math.min(latLng1.lat(), latLng2.lat());
    latMax = Math.max(latLng1.lat(), latLng2.lat());
    lngMin = Math.min(latLng1.lng(), latLng2.lng());
    lngMax = Math.max(latLng1.lng(), latLng2.lng());
    sw = new google.maps.LatLng(latMin, lngMin);
    ne = new google.maps.LatLng(latMax, lngMax);
    return new google.maps.LatLngBounds(sw, ne);
}

// Sets the map on all markers in the array.
function setAllMap(map) {
    for (var i = 0; i < markers.length; i++) {
        markers[i].setMap(map);
    }
}

// Removes the markers from the map, but keeps them in the array.
function clearMarkers() {
    setAllMap(null);
}

// Deletes all markers in the array by removing references to them.
function deleteMarkers() {
    clearMarkers();
    markers = [];
}
//draw rectangle
function drawAoiRectangle() {
    var latLngBounds = getPolygonBounds();
    var options = {
        //clickable: false,
        fillColor: "#0000FF",
        fillOpacity: 0.35,
        strokeColor: "#000000",
        strokeWeight: 2,
        strokeOpacity: 1,
        draggable: true,
        editable: true,
        geodesic: true,
        bounds: latLngBounds
    };
    polygon = new google.maps.Rectangle(options);
    polygon.setMap(map);
    getPoints(0);
    google.maps.event.addListener(polygon, "bounds_changed", function () {
        getPoints(1);
        $('img[src$="undo_poly.png"]').hide();//uncomment if need  undo resize functionality
    });
}
//get all points of the polygon with direction
function getPoints(param) {
    var bounds = polygon.getBounds();
    var ne = bounds.getNorthEast(); // LatLng of the north-east corner
    var sw = bounds.getSouthWest();
    var nw = new google.maps.LatLng(ne.lat(), sw.lng());
    var se = new google.maps.LatLng(sw.lat(), ne.lng());
    var points = "Top Right:" + ne + "<br/>" + "Top Left:" + nw + "<br />" + "Bottom Right" +
        se + "<br /> Bottom Left" + sw;
    $("#allcordinate").html(points);
    var latLng1 = markers[0].getPosition();
    var lat1 = latLng1.lat();
    var long1 = latLng1.lng();

    $("#nwLat").val(ne.lat());
    $("#nwLong").val(sw.lng());
    $("#seLat").val(sw.lat());
    $("#seLong").val(ne.lng());

    if (param == 1) {
        deleteMarkers();
        //add marker to the earlier positions
        //with the same ordering to keep markers array same
        if (markerPos1 == 'ne' || markerPos1 == 'sw') {
            console.log("ne sw");
            if (markerPos1 == 'ne') {
                addMarker(ne, "location");
                addMarker(sw, "location");
            } else {
                addMarker(sw, "location");
                addMarker(ne, "location");
            }
        } else {
            if (markerPos1 == 'nw') {
                addMarker(nw, "location");
                addMarker(se, "location");
            } else {
                addMarker(se, "location");
                addMarker(nw, "location");
            }
        }
        fillCoordinates();
    } else {//check which position has markers now
        markerPos1 = "";
        if (ne.lat() == lat1 && ne.lng() == long1) {
            markerPos1 = 'ne';
        } else if (sw.lat() == lat1 && sw.lng() == long1) {
            markerPos1 = 'sw';
        }
        if (nw.lat() == lat1 && nw.lng() == long1) {
            markerPos1 = 'nw';
        } else if (se.lat() == lat1 && se.lng() == long1) {
            markerPos1 = 'se';
        }
    }
}
//remove the rectangle from map
function clearAoiRectangle() {
    if ((polygon != undefined && polygon != "")) {
        polygon.setMap(null);
    }
    clearPolygons();
}
function clearPolygons() {
    if ((newpolygon != undefined && newpolygon != "")) {
        for (var i = 0; i < newpolygon.length; i++) {
            newpolygon[i].setMap(null);
        }
    }
}

google.maps.event.addDomListener(window, 'load', initialize);
// update the map based on the text boxes
$(document).ready(function () {

    $("#applyLatLong2").click(function () {

        //draw lat1 and long 1
        var decLat1 = $.trim($("#lat1").val());
        var decLng1 = $.trim($("#long1").val());
        var decLat2 = $.trim($("#lat2").val());
        var decLng2 = $.trim($("#long2").val());

        if ((decLat1 != "" && decLng1 == "") || (decLng1 != "" && decLat1 == "") || (decLat2 != "" && decLng2 == "") || (decLng2 != "" && decLat2 == "")) {

            $(this).parent().parent().parent().find(".msg-box").html('<p style="visibility: visible" class="error lat">Longitude and Latitude should be numeric values,where latitude ranges from -90 to +90 and longitude ranges from -180 to 180.Either top left point or bottom right point should be specified</p>');
            return false;
        }
        else if (((decLat1 != "") && (isNaN(decLat1) || (parseFloat(decLat1) < -90) || (parseFloat(decLat1) > 90)) ) || ((decLat2 != "") && (isNaN(decLat2) || (parseFloat(decLat2) < -90) || (parseFloat(decLat2) > 90))) || ((decLng2 != "") && (isNaN(decLng2) || (parseFloat(decLng2) < -180) || (parseFloat(decLng2) > 180))) || ((decLng1 != "") && (isNaN(decLng1) || (parseFloat(decLng1) < -180) || (parseFloat(decLng1) > 180)))) {
            $(this).parent().parent().parent().find(".msg-box").html('<p style="visibility: visible" class="error lat">Longitude and Latitude should be numeric values,where latitude ranges from -90 to +90 and longitude ranges from -180 to 180.Either top left point or bottom right point should be specified</p>');
            return false;
        }
        $(this).parent().parent().parent().find(".msg-box").html('');
        marker1 = true;
        marker2 = false;
        deleteMarkers();
        clearAoiRectangle();
        var mapposition = new google.maps.LatLng(decLat1, decLng1);
        var curmarker = new google.maps.Marker({
            position: mapposition,
            map: map
        });
        markers.push(curmarker);
        //map.setZoom(3);
        map.panTo(curmarker.position);
        var infowindow = new google.maps.InfoWindow({
            content: 'Location1'
        });
        google.maps.event.addListener(curmarker, 'click', function () {
            infowindow.open(map, curmarker);
        });
        //draw lat2 and long 2
        var $latlong2error = $(".latlong2error");
        $latlong2error.html("");
        if (decLat2 == "" || decLng2 == "") {
            $latlong2error.html("Invalid Co-ordinates");
            return;
        }

        //deleteMarkers();
        //clearAoiRectangle();
        if (marker1 == true && marker2 == true) {
            deleteMarkers();
            clearAoiRectangle();
        }
        mapposition = new google.maps.LatLng(decLat2, decLng2);
        curmarker = new google.maps.Marker({
            position: mapposition,
            map: map
        });
        markers.push(curmarker);
        //map.setZoom(3);
        map.panTo(curmarker.position);
        if (marker1 == true && marker2 == false) {
            drawAoiRectangle();
            marker1 = true;
            marker2 = true;
        }
        infowindow = new google.maps.InfoWindow({
            content: 'Location 2'
        });
        google.maps.event.addListener(curmarker, 'click', function () {
            infowindow.open(map, curmarker);
        });
    });


    function forHiddenFields() {

        //draw lat1 and long 1
        var decLat1 = $.trim($("#lat1").val());
        var decLng1 = $.trim($("#long1").val());
        var decLat2 = $.trim($("#lat2").val());
        var decLng2 = $.trim($("#long2").val());
        if ((decLat1 != "" && decLng1 == "") || (decLng1 != "" && decLat1 == "") || (decLat2 != "" && decLng2 == "") || (decLng2 != "" && decLat2 == "")) {

            $(this).parent().parent().parent().find(".msg-box").html('<p style="visibility: visible" class="error lat">Longitude and Latitude should be numeric values,where latitude ranges from -90 to +90 and longitude ranges from -180 to 180.Either top left point or bottom right point should be specified</p>');
            return false;
        }
        else if (((decLat1 != "") && (isNaN(decLat1) || (parseFloat(decLat1) < -90) || (parseFloat(decLat1) > 90)) ) || ((decLat2 != "") && (isNaN(decLat2) || (parseFloat(decLat2) < -90) || (parseFloat(decLat2) > 90))) || ((decLng2 != "") && (isNaN(decLng2) || (parseFloat(decLng2) < -180) || (parseFloat(decLng2) > 180))) || ((decLng1 != "") && (isNaN(decLng1) || (parseFloat(decLng1) < -180) || (parseFloat(decLng1) > 180)))) {
            $(this).parent().parent().parent().find(".msg-box").html('<p style="visibility: visible" class="error lat">Longitude and Latitude should be numeric values,where latitude ranges from -90 to +90 and longitude ranges from -180 to 180.Either top left point or bottom right point should be specified</p>');
            return false;
        }
        $(this).parent().parent().parent().find(".msg-box").html('');
        marker1 = true;
        marker2 = false;
        deleteMarkers();
        clearAoiRectangle();
        var mapposition = new google.maps.LatLng(decLat1, decLng1);
        var curmarker = new google.maps.Marker({
            position: mapposition,
            map: map
        });
        markers.push(curmarker);
        map.panTo(curmarker.position);
        var infowindow = new google.maps.InfoWindow({
            content: 'Location1'
        });
        google.maps.event.addListener(curmarker, 'click', function () {
            infowindow.open(map, curmarker);
        });
        //draw lat2 and long 2
        var $latlong2error = $(".latlong2error");
        $latlong2error.html("");
        if (decLat2 == "" || decLng2 == "") {
            $latlong2error.html("Invalid Co-ordinates");
            return;
        }

        //deleteMarkers();
        //clearAoiRectangle();
        if (marker1 == true && marker2 == true) {
            deleteMarkers();
            clearAoiRectangle();
        }
        mapposition = new google.maps.LatLng(decLat2, decLng2);
        curmarker = new google.maps.Marker({
            position: mapposition,
            map: map
        });
        markers.push(curmarker);
        //map.setZoom(3);
        map.panTo(curmarker.position);
        if (marker1 == true && marker2 == false) {
            drawAoiRectangle();
            marker1 = true;
            marker2 = true;
        }
        infowindow = new google.maps.InfoWindow({
            content: 'Location 2'
        });
        google.maps.event.addListener(curmarker, 'click', function () {
            infowindow.open(map, curmarker);
        });
    }

    //path row to lat long and then to draw map
    $("#pathrowId").click(function () {

        clearAoiRectangle();
        //draw lat1 and long 1
        var beginPath = $.trim($("#beginPath").val());
        var endPath = $.trim($("#endPath").val());
        var beginRow = $.trim($("#beginRow").val());
        var endRow = $.trim($("#endRow").val());


        if (((beginPath != "") && (beginRow == "")) || ((beginRow != "") && (beginPath == "")) || ((endPath != "") && (endRow == "")) || ((endRow != "" ) && (endPath == ""))) {
            $(this).parent().parent().parent().find(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
            //alert("");
            return false;
        }
        else if ((beginPath != "") && (isNaN(beginPath) || (parseInt(beginPath) < 1) || (parseInt(beginPath) > 233))) {

            $(this).parent().parent().parent().find(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
            return false;
        }
        else if ((beginRow != "") && (isNaN(beginRow) || (parseInt(beginRow) < 1) || (parseInt(beginRow) > 248))) {
            $(this).parent().parent().parent().find(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
            return false;
        }
        else if ((endPath != "") && (isNaN(endPath) || (parseInt(endPath) < 1) || (parseInt(endPath) > 233))) {
            $(this).parent().parent().parent().find(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
            return false;
        }
        else if ((endRow != "") && (isNaN(endRow) || (parseInt(endRow) < 1) || (parseInt(endRow) > 248))) {
            $(this).parent().parent().parent().find(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
            return false;
        }
        else if ((beginPath != "") && (endPath != "") && ((parseInt(beginPath) > parseInt(endPath)))) {
            $(this).parent().parent().parent().find(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
            return false;
        }
        else if ((beginRow != "") && (endRow != "") && ((parseInt(beginRow) > parseInt(endRow)))) {
            $(this).parent().parent().parent().find(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
            return false;
        }
        $(this).parent().parent().parent().find(".msg-box").html('');
        //ajax for 1st point
        $.ajax({
            data: {
                'beginpath': beginPath,
                'beginrow': beginRow,
                'endpath': endPath,
                'endrow': endRow
            },
            type: 'POST',
            url: "pathtolatlong",
            cache: false,
            success: function (data) {
                clearAoiRectangle();
                clearPolygons();
                var resultCordinates = JSON.parse(data);

                for (var i = 0; i < resultCordinates.length; i++) {
                    //draw map
                    drawPolygon(resultCordinates[i], i, newpolygon);
                    if (i == 2500) {
                        $('#pathrowId').parent().parent().parent().find(".msg-box").html('<p style="visibility: visible" class="success path"> Display of path/row boundaries are limited to a count of 2500. This limitation is only on the drawn regions and the search will still use all of the provided information</p>');
                    }
                }

                map.fitBounds(newpolygon[0].getBounds());

                //to handle zoom


                if (beginPath !== "" && endPath != "" && endRow != "" && beginRow != "") {
                    var yPath = (beginPath - beginRow);
                    var yRow = (endPath - endRow);
                    yPath = (yPath < 0) ? yPath * -1 : yPath;
                    yRow = (yRow < 0) ? yRow * -1 : yRow;

                    var YspaceDifference = yPath >= yRow ? yPath : yRow;

                    var xPath = (beginPath - endPath);
                    var xRow = (beginRow - endRow);
                    xPath = (xPath < 0) ? xPath * -1 : xPath;
                    xRow = (xRow < 0) ? xRow * -1 : xRow;

                    var XspaceDifference = xPath >= xRow ? xPath : xRow;

                    XspaceDifference = (XspaceDifference < 0) ? XspaceDifference * -1 : XspaceDifference;
                    YspaceDifference = (YspaceDifference < 0) ? YspaceDifference * -1 : YspaceDifference;

                    if (XspaceDifference > YspaceDifference) {
                        spaceDifference = XspaceDifference;
                    }
                    else {
                        spaceDifference = YspaceDifference;
                    }

                } else {

                    spaceDifference = 1;
                }
                //zoom handler ends
                if (spaceDifference >= 70) {
                    map.setZoom(1);
                } else if (spaceDifference >= 40) {
                    map.setZoom(2);
                } else {
                    map.setZoom(3);
                }
                //zoom handler ends

//demo script
                $.ajax({
                    data: {
                        'beginpath': beginPath,
                        'beginrow': beginRow,
                        'endpath': endPath,
                        'endrow': endRow
                    },
                    type: 'POST',
                    url: "findcenter",
                    cache: false,
                    success: function (data) {
                        var resultCenter = JSON.parse(data);
                        decLat1 = resultCenter[0][0];
                        decLng1 = resultCenter[0][1];
                        var mapposition = new google.maps.LatLng(decLat1, decLng1);

                        map.panTo(mapposition);
                        //map.setZoom(map.getZoom()-2);
                    }
                });
//demo script


            }
        });

    });
    function clearPolygons() {
        if ((newpolygon != undefined && newpolygon != "")) {
            for (var i = 0; i < newpolygon.length; i++) {
                newpolygon[i].setMap(null);
            }
        }
        deleteMarkers();
    }

    function drawPolygon(pointsArray, i, newpolygon) {
        var options = {
            fillColor: "#0000FF",
            fillOpacity: 0.35,
            strokeColor: "#000000",
            strokeWeight: 2,
            strokeOpacity: 1,
            //draggable: true,
            geodesic: false,
            paths: [new google.maps.LatLng(pointsArray[0], pointsArray[1]),
                new google.maps.LatLng(pointsArray[2], pointsArray[3]),
                new google.maps.LatLng(pointsArray[4], pointsArray[5]),
                new google.maps.LatLng(pointsArray[6], pointsArray[7])]
        };
        newpolygon[i] = new google.maps.Polygon(options);
        newpolygon[i].setMap(map);
    }


    $("#lat1,#long1,#lat2,#long2").focus(function () {

    }).blur(function () {
        forHiddenFields();
    });

});

