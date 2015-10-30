@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'visualize'))

<!--header wrap end-->

<style>

</style>

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/{{ HTML::link('visualize', 'Visualize') }}</li>
        </ul>
        <div class="help-div right">
            <!--            <a href="javascript:void(0)" id="help-button" class="sprite help-icon"></a>-->
        </div>
    </div>
</section>
<!--popup loading div start here -->
<!--<div class="popup-wrap" id="help-popup-wrap" style="display: none;">-->
<!--    <div class="popup-container">-->
<!--        <a class="close close-btn" id="help-close-button" href="#">x</a>-->
<!---->
<!--        <div class="popup-heading"><h5 class="text-left">Visualize</h5></div>-->
<!--        <p class="text-left marg-no">Some description of the vissualization.</p>-->
<!--    </div>-->
<!--</div>-->
<!--popup loading div end here -->
<!--content wrap start-->
<section class="content-wrap">
    <div class="container">


        <div class="terminal-wrap">
            <header>
                <span>Visualization</span>
            </header>
            <div class="terminal-content">
                <div id="map" style="width: 100%; height: 500px"></div>
            </div>
        </div>
    </div>

</section>

{{ HTML::style( asset('css/leaflet.css') ) }}
{{ HTML::style( asset('css/leaflet-fullscreen.css') ) }}
{{HTML::script('js/leaflet.js'); }}
{{HTML::script('js/leaflet-fullscreen.js'); }}
{{HTML::script('js/leaflet-providers.js'); }}

<script>
    $(function () {
        var baseLayers = {
            'Blue Marble': L.tileLayer.wms('http://rdc-snsf.org//diss_geoserver/gwc/service/wms', {
                layers: ['unredd:blue_marble'],
                format: 'image/png',
                transparent: true
            })
        };

        var overlayLayers = {
            'OpenStreetMap': L.tileLayer('http://otile{s}.mqcdn.com/tiles/1.0.0/{type}/{z}/{x}/{y}.{ext}', {
                type: 'hyb',
                ext: 'png',
                attribution: 'Tiles Courtesy of <a href="http://www.mapquest.com/">MapQuest</a> &mdash; Map data &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
                subdomains: '1234',
                opacity: 0.9
            })
        };

        @foreach ($layers as $layer)
            overlayLayers[toLayerLabel('{{$layer}}')] = create('{{$userName}}', '{{$layer}}');
        @endforeach

        var map = L.map('map', {
            layers: [baseLayers['Blue Marble'], overlayLayers['OpenStreetMap']],
            fullscreenControl: true,
            fullscreenControlOptions: {
                position: 'topleft'
            }
        });

        L.control.layers(baseLayers, overlayLayers).addTo(map);
        var bbox = [[{{$bbox[0][0]}}, {{$bbox[0][1]}}], [{{$bbox[1][0]}}, {{$bbox[1][1]}}]];
        map.fitBounds(bbox);

        function toLayerLabel(layer) {
            layer = layer.replace(new RegExp('_', 'g'), ' ');
            layer = layer.charAt(0).toUpperCase() + layer.slice(1);
            return layer
        }

        function create(user, name) {
            return L.tileLayer.wms("http://{{SdmsConfig::value('geoserverURI')}}" + user + "/wms", {
                layers: user + ':' + name,
                format: 'image/png',
                transparent: true,
                version: '1.1.0'
            });
        }
    });

</script>
<!--content wrap end-->
@stop 
