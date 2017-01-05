var map = L.map('map').setView([43.1353033129, 12.8492323295], 5);

var baseLayers = {
    'OpenStreetMap': L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map)
}

var mapLayers = {}
var mapControls = L.control.layers(baseLayers, mapLayers).addTo(map)

$(function () {

    var load_file_html = $('#load_file_template').html()
    var layer_template = _.template($('#layer_template').html())
    var band_template = _.template($('#band_template').html())

    var $body = $('body');
    var $layers = $('#layers')
    $.get({
        url: '/layers',
        success: createLayers
    })

    $('#add_layer').click(function () {
        $layers.append($.parseHTML(load_file_html))
    })

    $layers.on('click', '.remove_layer', function (e) {
        e.preventDefault()
        var $layer = $(e.target).parents('.layer')
        var layerId = $layer.find('input[name=layer_id]').val()
        var path = $layer.find('input[name=path]').val()
        $layer.remove()
        mapLayers[path].remove()
        delete mapLayers[path]
        if (!layerId)
            return
        $.post({
            url: '/layers/remove',
            data: {layer_id: layerId},
            success: function (data) {
                console.log("Removed")
            }
        })
    })

    $layers.on('click', '.remove_band', function (e) {
        e.preventDefault()
        $(e.target).parents('.band').remove()
    })

    $layers.on('click', '.add_band', function (e) {
        e.preventDefault()
        var $layer = $(e.target).parents('.layer')
        addBand($layer)
    })

    $body.on('submit', '.load', function (e) {
        e.preventDefault()
        var $form = $(e.target)
        var $layer = $form.parent()
        $.get({
            url: '/file/load',
            data: $form.serialize(),
            success: configureLayer,
            error: function (error) {
                console.log(error.responseText)
            }
        })

        function configureLayer(file) {
            $layer.empty()
            $layer.append(layer_template({layer_id: '', path: file.path}))
            if (file.type === 'shape') {
                $layer.find('.add_band').remove()
            } else
                addBand($layer)
        }
    })

    $body.on('submit', '.save', function (e) {
        e.preventDefault()
        var $form = $(e.target)
        var $layer = $form.parent()
        var layerId = $layer.find('input[name=layer_id]').val()
        var bands = $.map($layer.find('.bands .band'), function (band) {
            var $band = $(band)
            return {
                index: $band.find('input[name=index]').val(),
                min: $band.find('input[name=min]').val(),
                max: $band.find('input[name=max]').val(),
                palette: _.filter($band.find('input[name=palette]').val().split(/[, ]/), function (c) {
                    return c
                })
            }
        })
        var data = {
            layer_id: $layer.find('input[name=layer_id]').val(),
            path: $layer.find('input[name=path]').val()
        }
        if (bands.length > 0)
            data.bands = JSON.stringify(bands)
        $.post({
            url: '/layers',
            data: data,
            success: layerSaved,
            error: function (error) {
                console.log(error.responseText)
            }
        })

        function layerSaved(layerId) {
            $layer.find('input[name=layer_id]').val(layerId)
            var path = $layer.find('input[name=path]').val()
            updateLayer(path, layerId)
        }
    })

    function createLayers(layers) {
        $layers.empty()
        _.each(layers, function (layer) {
            $layer = $(layer_template(layer))
            $bands = $layer.find('.bands')
            _.each(layer.bands, function (band) {
                $bands.append(band_template(band))
            })
            $layers.append($layer)
            updateLayer(layer.path, layer.layer_id)
        })
    }

    function addBand($layer) {
        var $bands = $layer.find('.bands')
        $bands.append(band_template({index: '', min: 0, max: 5000, palette: '#000000, #ffffff'}))
    }

    function updateLayer(path, layerId) {
        if (mapLayers[path])
            mapLayers[path].remove()
        mapLayers[path] = L.tileLayer('/layer/' + layerId + '/{z}/{x}/{y}.png?' + Math.random(), {
            tms: true
        }).addTo(map)
        mapControls.remove()
        mapControls = L.control.layers(baseLayers, mapLayers).addTo(map)
    }
})