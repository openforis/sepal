@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'search'))


<!--header wrap end-->
<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/{{ HTML::link('search', 'Search') }}</li>
        </ul>
        <div class="help-div right">
            <a href="javascript:void(0)" id="help-button" class="sprite help-icon"></a>
        </div>
    </div>
</section>
<!--popup loading div start here -->
<div class="popup-wrap" id="help-popup-wrap" style="display: none;">
    <div class="popup-container">
        <a class="close close-btn" id="help-close-button" href="#">x</a>

        <div class="popup-heading"><h5 class="text-left">Search</h5></div>
        <p class="text-left marg-no">The search interface below allows the user to quickly filter through the Landsat
            archives. SEPAL contains the metadata for all currently available Landsat images housed within the USGS
            archive and will present the user with all images which meet the specified criteria.</p>

        <p class="text-left marg-no">Users may specify the location of desired images through either the path and row
            schema found in the World Reference System 2 (WRS-2) or latitude and longitude coordinates. If latitude and
            longitude coordinates are used, the user must specify either a single point or the upper left and lower
            right corners of a bounding box. The latitude and longitude coordinates will be converted into the set of
            path and row combinations that are required to completely cover the defined bounding box. For either method
            of specification, the entered data will be displayed on the Google Earth map found below the search
            boxes.</p>

        <p class="text-left marg-no">Users may also specify additional constraints on the dataset. These constraints
            include the desired date range, the specific satellite instrument, and the allowable cloud contamination
            found in the scene. Clicking on the submit button will query the archive and bring up the returned
            results.</p>
    </div>
</div>
<!--popup loading div end here -->
<!--content wrap start-->
<section class="content-wrap">
    <div class="container">
        <div class="box-wrap">
            {{ Form::open(array('url'=>'searchresults','method'=>'get','files'=>'true')) }}
            <ul class="row">
                <li class="col-lg-6">
                    <div class="col-content">
                        <header>
                            <span class="sprite icon-area"></span>

                            <p><b>Enter Area of Interest</b> (Lat/Long or Path/Row entry required)</p>
                        </header>
                        <section class="border-box">
                            <div class="web-accordion">

                                <div class="web-accordion-toggle" area="path"><span class="sprite toggle-arrow"></span>Path/Row
                                </div>

                                @if ($errors->has('beginPath')|| $errors->has('endPath') || $errors->has('beginRow') ||
                                $errors->has('endRow'))
                                <div class="web-accordion-content">
                                    {{Form::hidden('identifier','1',$attributes = array('id' => 'identifier'))}}
                                    @else
                                    <div class="web-accordion-content" style="display:none;">
                                        {{Form::hidden('identifier','2',$attributes = array('id' => 'identifier'))}}
                                        @endif


                                        <span>Enter Path and Row (to enter a single path and row, fill out left column only) </span>

                                        <div class="clearfix"></div>
                                        <div id="wrs-msg-box" class="msg-box">
                                            @if ($errors->has('beginPath')|| $errors->has('endPath') ||
                                            $errors->has('beginRow') || $errors->has('endRow'))
                                            <p class="error path" style="visibility: visible">
                                                The WRS Paths/Rows should be integers. The row value ranges from 1 to
                                                248 and path value ranges from 1 to 233. For both path and row, start
                                                value should be lesser than or equal to end value.Path and row should be
                                                specified in pairs.
                                            </p> @endif
                                        </div>

                                        <ul class="search-form row">
                                            <li>
                                                <span>WRS Path</span>
                                                {{Form::text('beginPath','',$attributes = array('class' =>
                                                'form-input','autocomplete' => 'off','id'=>'beginPath'))}}
                                                {{Form::hidden('beginPathLat','',$attributes = array('class' =>
                                                'form-input','id'=>'beginPathLat'))}}
                                            </li>
                                            <li>
                                                <b></b>
                                                <span>to</span>
                                                {{Form::text('endPath','',$attributes = array('class' =>
                                                'form-input','autocomplete' => 'off','id'=>'endPath'))}}
                                                {{Form::hidden('endPathLat','',$attributes = array('class' =>
                                                'form-input','id'=>'endPathLat'))}}
                                            </li>
                                            <li>
                                                <span>WRS Row</span>
                                                {{Form::text('beginRow','',$attributes = array('class' =>
                                                'form-input','autocomplete' => 'off','id'=>'beginRow'))}}
                                                {{Form::hidden('beginRowLong','',$attributes = array('class' =>
                                                'form-input','id'=>'beginRowLong'))}}
                                            </li>
                                            <li>
                                                <b></b>
                                                <span>to</span>
                                                {{Form::text('endRow','',$attributes = array('class' =>
                                                'form-input','autocomplete' => 'off','id'=>'endRow'))}}
                                                {{Form::hidden('endRowLong','',$attributes = array('class' =>
                                                'form-input','id'=>'endRowLong'))}}
                                                {{Form::button('Apply changes to map',$attributes = array('class' =>
                                                'smallbuttonblue button right','id' => 'pathrowId'))}}
                                            </li>
                                        </ul>
                                    </div>


                                    @if ($errors->has('beginPath')|| $errors->has('endPath') || $errors->has('beginRow')
                                    || $errors->has('endRow'))
                                    <div class="web-accordion-toggle " area="lat"><span
                                            class="sprite toggle-arrow"></span>Lat/Long
                                    </div>
                                    @else
                                    <div class="web-accordion-toggle open" area="lat"><span
                                            class="sprite toggle-arrow"></span>Lat/Long
                                    </div>
                                    @endif


                                    @if ($errors->has('beginPath')|| $errors->has('endPath') || $errors->has('beginRow')
                                    || $errors->has('endRow'))
                                    <div class="web-accordion-content" style="display:none;">
                                        @else
                                        <div class="web-accordion-content">
                                            @endif

                                            <span>Enter Longitude/Latitude </span>

                                            <div class="clearfix"></div>

                                            <div id="latlng-msg-box" class="msg-box">
                                                @if ($errors->has('topLeftLatitude01')||
                                                $errors->has('topLeftLongitude01') ||
                                                $errors->has('bottomRightLatitude01') ||
                                                $errors->has('bottomRightLongitude01'))
                                                <p class="error lat" style="visibility: visible">
                                                    Longitude and Latitude should be numeric values,where latitude
                                                    ranges from
                                                    -90 to +90 and longitude ranges from -180 to 180.
                                                    Either top left point or bottom right point should be specified
                                                </p> @elseif ($errors->has('topLeftLatitude')||
                                                $errors->has('topLeftLongitude') ||
                                                $errors->has('bottomRightLatitude') ||
                                                $errors->has('bottomRightLongitude'))
                                                <p class="error" style="visibility: visible">
                                                    Something went wrong.Please refresh the page and try again later
                                                </p> @endif
                                            </div>

                                            <ul class="search-form row">
                                                <li>
                                                    <span>1.Latitude</span>
                                                    {{Form::text('topLeftLatitude01','',$attributes = array('class' =>
                                                    'form-input latitude','autocomplete' => 'off','alt' => 'Latitude
                                                    start input','onkeypress' => 'return event.keyCode!=13','maxlength'
                                                    => '39','id' => 'lat1'))}}
                                                    <div class="clearfix"></div>
                                                    <!--<a href="#" class="button right">Clear</a>-->
                                                </li>
                                                <li>
                                                    <b></b>
                                                    <span>Longitude</span>
                                                    {{Form::text('topLeftLongitude01','',$attributes = array('class' =>
                                                    'form-input longitude','autocomplete' => 'off','alt' => 'Longitude
                                                    start input','onkeypress' => 'return event.keyCode!=13','maxlength'
                                                    => '40','id' => 'long1'))}}
                                                    <div class="clearfix"></div>
                                                    {{--Form::button('Apply changes to map',$attributes = array('class'
                                                    => 'smallbuttonblue button right','id' => 'applyLatLong1'))--}}

                                                </li>
                                                <li>
                                                    <span>2.Latitude</span>
                                                    {{Form::text('bottomRightLatitude01','',$attributes = array('class'
                                                    => 'form-input latitude','autocomplete' => 'off','alt' => 'Latitude
                                                    start input','onkeypress' => 'return event.keyCode!=13','maxlength'
                                                    => '39','id' => 'lat2'))}}

                                                    <div class="clearfix"></div>
                                                    <!--<a href="#" class="button right">Clear</a>-->
                                                </li>
                                                <li>
                                                    <b></b>
                                                    <span>Longitude</span>
                                                    {{Form::text('bottomRightLongitude01','',$attributes = array('class'
                                                    => 'form-input longitude','autocomplete' => 'off','alt' =>
                                                    'Longitude start input','onkeypress' => 'return
                                                    event.keyCode!=13','maxlength' => '40','id' => 'long2'))}}
                                                    <div class="clearfix"></div>
                                                    {{Form::button('Apply changes to map',$attributes = array('class' =>
                                                    'smallbuttonblue button right','id' => 'applyLatLong2'))}}
                                                </li>
                                            </ul>
                                        </div>
                                    </div>
                        </section>
                    </div>
                </li>
                <li class="col-lg-6">
                    <div class="col-content">
                        <header>
                            <span class="sprite icon-area2"></span>

                            <p><b>Enter additional criteria</b></p>
                        </header>
                        <section class="border-box padd20">
                            <div class="msg-box">
                                @if ($errors->has('sensor'))
                                <p class="error lat" style="visibility: visible">
                                    A valid dataset should be specified
                                </p>
                                @endif
                            </div>
                            <ul class="search-form row">
                                <li style="float:right;width:100%;">
                                    <span>Choose a dataset</span>
                                    {{ Form::select('sensor', $datasetList, 'LANDSAT_8',array('class'=>'form-input')) }}
                                </li>
                            </ul>
                            <span>Enter Date Range (required) </span>

                            <div class="msg-box"> @if ($errors->has('sceneStartTime')|| $errors->has('sceneStopTime') ||
                                $errors->has('name'))
                                <p class="error" style="visibility: visible">Both start date and end date are
                                    required,the format should be '2014-09-23' and start date should be less than end
                                    date</p> @endif
                            </div>

                            <ul class="search-form row">
                                <li>
                                    <span>Starting</span>
                                    <span class="sprite date-picker right"></span>

                                    {{Form::text('sceneStartTime','', array('placeholder' => 'YYYY-MM-DD','size' =>
                                    '10','maxlength'=>'10','alt'=>'Start Date Calendar','id'=>'sceneStartTime','class'
                                    => 'form-input','autocomplete'=>'off'))}}
                                </li>
                                <li>
                                    <b></b>
                                    <span>Ending</span>
                                    <span class="sprite date-picker right"></span>
                                    {{Form::text('sceneStopTime','', array('placeholder' => 'YYYY-MM-DD','size' =>
                                    '10','maxlength'=>'10','alt'=>'End Date Calendar','id'=>'sceneStopTime','class' =>
                                    'form-input','autocomplete'=>'off'))}}
                                </li>
                            </ul>
                            {{ Form::checkbox('name',1,null,array('class' => 'form-input')); }}<span>Search these months only (ex. 03/12/2008-05/15/2009 will return records for March, April and May of 2008 and 2009)</span>
                            <ul class="search-form row">
                                <li style="">
                                    <span>Cloud Cover</span>
                                    {{ Form::select('cloud_cover', array('100' => 'All', '10' => 'Less than 10%',
                                    '20'=>'Less than 20%','30'=>'Less than 30%','40'=>'Less than 40%',
                                    '50'=>'Less than 50%','60'=>'Less than 60%','70'=>'Less than 70%','80'=>'Less than
                                    80%',
                                    '90'=>'Less than 90%'),
                                    '100',array('class'=>'form-input')) }}
                                </li>
                            </ul>

                        </section>
                        {{Form::submit('Search',array('id'=>'search', 'class'=>'button right'))}}
                    </div>
                </li>
            </ul>

            {{Form::hidden('topLeftLatitude','',$attributes = array('id' => 'nwLat'))}}
            {{Form::hidden('topLeftLongitude','',$attributes = array('id' => 'nwLong'))}}
            {{Form::hidden('bottomRightLatitude','',$attributes = array('id' => 'seLat'))}}
            {{Form::hidden('bottomRightLongitude','',$attributes = array('id' => 'seLong'))}}

            {{Form::close()}}
        </div>
    </div>
</section>
<!--content wrap end-->

<!--Map wrap start-->
<section class="map-wrap">
    <div class="container" style="height:600px;max-width:1024px">

        <div id="map-canvas" style="float:left;height:100%;width:100%;"></div>

    </div>
</section>
<div class="clearfix"></div>
<div id="allcordinate" style="display:none"></div>
<!--Map wrap end-->


{{ HTML::script('js/jquery-ui.js'); }}
{{ HTML::script('js/jquery.maskedinput.js'); }}
{{ HTML::style( asset('css/jquery-ui.css') ) }}
{{ HTML::style( asset('css/leaflet.css') ) }}
{{ HTML::style( asset('css/leaflet.draw.css') ) }}
<script>
    jQuery("#sceneStartTime,#sceneStopTime").datepicker({
        dateFormat: 'yy-mm-dd'

    }).mask('9999-99-99');

</script>
{{HTML::script('js/leaflet.js'); }}
{{HTML::script('js/leaflet-providers.js'); }}
{{HTML::script('js/leaflet.draw.js'); }}
{{HTML::script('js/lodash.js'); }}
{{HTML::script('js/bind_map.js'); }}
{{HTML::script('js/map.js'); }}

@stop

