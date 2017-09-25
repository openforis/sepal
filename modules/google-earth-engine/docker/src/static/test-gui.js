(function () {
    var createMap = function (mapIndex) {
        return new google.maps.Map(
            document.getElementById('map' + mapIndex), {
                zoom: 4,
                minZoom: 3,
                maxZoom: 15,
                center: new google.maps.LatLng(16.7794913, 9.6771556)
            })
    }

    var maps = [createMap(1), createMap(2)]
    google.maps.event.addListener(maps[0], 'bounds_changed', (function () {
        maps[1].setCenter(maps[0].getCenter())
        maps[1].setZoom(maps[0].getZoom())
    }));
    google.maps.event.addListener(maps[1], 'bounds_changed', (function () {
        maps[0].setCenter(maps[1].getCenter())
        maps[0].setZoom(maps[1].getZoom())
    }));

    maps[1].setCenter(maps[0].getCenter())
    $('#form').submit(function (e) {
        e.preventDefault()
        preview(1)
        preview(2)
    })


    $('#classifyForm').submit(function (e) {
        e.preventDefault()
        classify()
        return false
    })

    $('#exportMosaic').click(function (e) {
        e.preventDefault()
        exportMosaic()
    })

    $('#sceneIdForm').submit(function (e) {
        e.preventDefault()
        previewScenes(1)
        previewScenes(2)
    })


    $('#sceneAreasForm').submit(function (e) {
        e.preventDefault()
        findSceneAreas()
    })

    $('#bestScenesForm').submit(function (e) {
        e.preventDefault()
        bestScenes()
    })


    $('#exportForm').submit(function (e) {
        e.preventDefault()
        exportParams()
    })


    $('#dataSet').find('input').change(function () {
        if (this.value === 'LANDSAT') {
            $('#sensors').show()
        } else {
            $('#sensors').hide()
        }
    })

    var shape = null
    var drawingManager = new google.maps.drawing.DrawingManager({
        drawingControl: true,
        drawingControlOptions: {
            position: google.maps.ControlPosition.TOP_CENTER,
            drawingModes: [
                google.maps.drawing.OverlayType.POLYGON
            ]
        },
        polygonOptions: {
            fillOpacity: 0,
            strokeWeight: 2
        }
    });
    drawingManager.setMap(maps[0]);
    google.maps.event.addListener(drawingManager, 'overlaycomplete', function (e) {
        drawingManager.setDrawingMode(null);
        if (shape !== null)
            shape.setMap(null)
        var newShape = e.overlay;
        shape = newShape
        newShape.type = e.type;
        google.maps.event.addListener(newShape, 'click', function () {
            shape.setMap(null)
            shape = null
        });
    })

    function createPolygon() {
        var polygon = []
        shape.getPath().forEach(function (a) {
            polygon.push([a.lng(), a.lat()])
        })
        polygon.push(polygon[0])
        return polygon
    }

    var fromDate = new Date()
    fromDate.setMonth(0)
    fromDate.setDate(1)
    var fromDatePicker = createDatePicker($('#from-date')[0], fromDate)
    var toDatePicker = createDatePicker($('#to-date')[0], new Date())
    $('#target-day-of-year').val(dayOfYear())

    function createQuery(mapIndex) {
        var mosaic = createMosaic(mapIndex)
        var sensors = []
        $('#sensors').find('input:checked').each(function () {
            sensors.push($(this).attr('id'))
        })
        mosaic.sensors = sensors
        mosaic.fromDate = fromDatePicker.getDate().getTime()
        mosaic.toDate = toDatePicker.getDate().getTime()
        mosaic.type = 'automatic'
        return {image: JSON.stringify(mosaic)}
    }

    function findSceneAreas() {
        var aoi = createAoi()
        var query = {
            aoi: JSON.stringify(aoi),
            dataSet: $('input[name=dataSet]:checked').val()
        }
        $.getJSON('sceneareas', query, function (data) {
            $('#sceneAreas').html("<pre>" + JSON.stringify(data, null, 2) + "</pre>")
        })
    }

    function bestScenes() {
        var aoi = createAoi()
        var query = {
            aoi: JSON.stringify(aoi),
            dataSet: $('input[name=dataSet]:checked').val(),
            fromDate: fromDatePicker.getDate().getTime(),
            toDate: toDatePicker.getDate().getTime(),
            targetDayOfYear: $('#target-day-of-year').val(),
            targetDayOfYearWeight: $('#target-day-of-year-weight').val(),
            shadowTolerance: $('#shadow-tolerance').val(),
            hazeTolerance: $('#haze-tolerance').val(),
            greennessWeight: $('#greenness-weight').val()
        }
        $.getJSON('best-scenes', query, function (data) {
            var scenes = ''
            $.each(data, function (i, scene) {
                scenes += scene
                if (i < scenes.length - 1)
                    scenes += '\n'
            })
            $('#sceneIds').val(scenes)
        })
    }

    function preview(mapIndex) {
        var handler = function (data) {
            $('#response').html(JSON.stringify(data))
            var mapId = data.mapId
            var token = data.token
            render(mapId, token, mapIndex)
        }

        $.post({
            url: 'preview',
            data: createQuery(mapIndex),
            dataType: 'json',
            success: handler
        })
    }

    function classify() {
        var data = {
            imageType: 'CLASSIFICATION',
            tableName: $('#fusionTable').val(),
            classProperty: $('#classProperty').val(),
            imageToClassify: JSON.parse(($('#sceneIds').val() ? createScenesQuery(1) : createQuery(1)).image)
        }

        var handler = function (data) {
            $('#response').html(JSON.stringify(data))
            var mapId = data.mapId
            var token = data.token
            render(mapId, token, 1)
        }

        $.post({
            url: 'preview',
            data: {image: JSON.stringify(data)},
            dataType: 'json',
            success: handler
        })
    }

    function exportMosaic() {
        var data = $('#sceneIds').val() ? createScenesQuery(1) : createQuery(1)
        data.name = $('#exportName').val()
        $.post({
            url: 'download',
            data: data,
            success: function (data) {
                console.log("Downloading...")
                console.log(data)
            }
        })
    }


    function exportParams() {
        var data = $('#exportParams').val()
        $.post({
            url: 'download',
            data: data,
            success: function (data) {
                console.log("Downloading...")
                console.log(data)
            }
        })
    }

    function createAoi() {
        if (shape !== null)
            return {
                type: 'polygon',
                path: createPolygon()
            }
        else {
            var iso = $('#countries').val()
            return {
                type: 'fusionTable',
                tableName: '15_cKgOA-AkdD6EiO-QW9JXM8_1-dPuuj1dqFr17F',
                keyColumn: 'ISO',
                keyValue: iso
            }
        }
    }

    function createMosaic(mapIndex) {
        var dataSet = $('input[name=dataSet]:checked').val()
        var bands = $('#bands' + mapIndex).val().split(', ')
        var targetDayOfYear = $('#target-day-of-year').val()
        var targetDayOfYearWeight = $('#target-day-of-year-weight').val()
        var shadowTolerance = $('#shadow-tolerance').val()
        var hazeTolerance = $('#haze-tolerance').val()
        var greennessWeight = $('#greenness-weight').val()
        var medianComposite = $('input[name="median-composite"]:checked').val()
        var brdfCorrect = $('input[name="brdf-correct"]:checked').val()
        var maskClouds = $('input[name="mask-clouds"]:checked').val()
        var maskSnow = $('input[name="mask-snow"]:checked').val()


        var classesToMask = []
        $('#classes-to-mask').find('input:checked').each(function () {
            classesToMask.push($(this).attr('id'))
        })

        return {
            aoi: createAoi(),
            targetDayOfYear: targetDayOfYear,
            targetDayOfYearWeight: targetDayOfYearWeight,
            shadowTolerance: shadowTolerance,
            hazeTolerance: hazeTolerance,
            greennessWeight: greennessWeight,
            dataSet: dataSet,
            bands: bands,
            medianComposite: medianComposite,
            brdfCorrect: brdfCorrect,
            maskClouds: maskClouds,
            maskSnow: maskSnow,
            classesToMask: classesToMask

        }
    }

    function createScenesQuery(mapIndex) {
        var mosaic = createMosaic(mapIndex)
        mosaic.sceneIds = $('#sceneIds').val().trim().split('\n')
        mosaic.type = 'manual'
        return {image: JSON.stringify(mosaic)}
    }

    function previewScenes(mapIndex) {
        var handler = function (data) {
            var mapId = data.mapId
            var token = data.token
            render(mapId, token, mapIndex)
        }

        $.post({
            url: 'preview',
            data: createScenesQuery(mapIndex),
            dataType: 'json',
            success: handler
        })
    }

    function render(mapId, token, mapIndex) {
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
        var map = maps[mapIndex - 1]
        var mapType = new google.maps.ImageMapType(eeMapOptions)
        map.overlayMapTypes.clear()
        map.overlayMapTypes.push(mapType)
    }

    function createDatePicker(field, date) {
        var datePicker = new Pikaday({
            field: field,
            defaultDate: date
        })
        datePicker.setDate(date)
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
