
@section('sidebar')
@parent
@stop

@section('content')
<!--header wrap start-->
@include('includes.menu')
<!--header wrap end-->

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/Search Results</li>
        </ul>                
       
    </div>
</section>

<!--content wrap start-->
<section class="content-wrap">
    <div class="container">
        <h2>Search Results</h2>
        <p>
         Thumbnail images for all entries in the results of the most recent query are shown below. The query can be updated by changing the data in the search interface on the left and clicking submit.
        </p>
        <p>
        The metadata information (Path/Row, Date, and Cloud Cover) for each scene is shown below the thumbnail image. Users can sort the set of results based on any of the four displayed metadata criteria. Double clicking on an image will pop up a full resolution version of the browse image. Clicking on the checkbox will flag the image and clicking on the Request Scenes button will copy all flagged images to the user’s working directory. This process may take a significant amount of time depending on the quantity of requested data.     
        </p>    
        <div class="box-wrap search-result-wrap">

            <!--left side vertical box start here -->
            <div class="left-search-box">
                {{ Form::open(array('url'=>'search','method'=>'post','files'=>'true')) }}
                <ul class="row">
                    <li class="col-lg-6">
                        <div class="col-content">
                            <header>
                                <span class="sprite icon-area"></span>
                                <p><b>Enter Area of Interest</b> (Lat/Long or Path/Row entry required)</p>
                            </header>
                            <section class="border-box">
                                <div class="web-accordion">
                                    <div class="web-accordion-toggle"><span class="sprite toggle-arrow"></span>Path/Row</div>
                                    <div class="web-accordion-content" style="display:none">
                                        <span>Enter Path and Row (to enter a single path and row, fill out left column only) </span>
                                        <div class="clearfix"></div>
                                        <ul class="search-form row">
                                            <li>
                                                <span>WRS Path</span>
                                                {{Form::text('beginPath',5,$attributes = array('class' => 'form-input'))}}
                                            </li>
                                            <li>
                                                <b></b>
                                                <span>to</span>
                                                {{Form::text('endPath',80,$attributes = array('class' => 'form-input'))}}
                                            </li>
                                            <li>
                                                <span>WRS Row</span>
                                                {{Form::text('beginRow',230,$attributes = array('class' => 'form-input'))}}
                                            </li>
                                            <li>
                                                <b></b>
                                                <span>to</span>
                                                {{Form::text('endRow',290,$attributes = array('class' => 'form-input'))}}
                                            </li>
                                        </ul>
                                    </div>
                                    <div class="web-accordion-toggle"><span class="sprite toggle-arrow"></span>Lat/Long</div>
                                    <div class="web-accordion-content" style="display:none">
                                        <span>Enter Longitude/Latitude  </span>
                                        <div class="clearfix"></div>
                                        <ul class="search-form row">
                                            <li>
                                                <span>1.Latitude</span>
                                                {{Form::text('startLatitude','',$attributes = array('class' => 'form-input'))}}
                                                <div class="clearfix"></div>
                                                <a href="#" class="button right">Clear</a>
                                            </li>
                                            <li>
                                                <b></b>
                                                <span>Longitude</span>
                                                {{Form::text('startLongitude','',$attributes = array('class' => 'form-input'))}} 
                                                <div class="clearfix"></div>
                                                <a href="#" class="button right">Clear</a>
                                            </li>
                                            <li>
                                                <span>2.Latitude</span>
                                                {{Form::text('endLatitude','',$attributes = array('class' => 'form-input'))}}
                                                <div class="clearfix"></div>
                                                <a href="#" class="button right">Clear</a>
                                            </li>
                                            <li>
                                                <b></b>
                                                <span>Longitude</span>
                                                {{Form::text('endLongitude','',$attributes = array('class' => 'form-input'))}}
                                                <div class="clearfix"></div>
                                                <a href="#" class="button right">Clear</a>
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
                                <p><b>Enter Area of Interest</b> (Lat/Long or Path/Row entry required)</p>
                            </header>
                            <section class="border-box padd20">
                                <ul class="search-form row">
                                    <li style="float:right;width:100%;">
                                        <span>choose a dataset</span>
                                        {{ Form::select('sensor', array('OLI_TIRS' => 'Landsat 8 OLI/TIRS', 'LANDSAT_ETM_SLC_OFF' => 'Landsat 7 SLC-off (2003 -&gt;)',
                                        'LANDSAT_ETM'=>'Landsat 7 SLC-on (1999-2003)','LANDSAT_TM'=>'Landsat 4-5 TM','LANDSAT_MSS'=>'Landsat 4-5 MSS',
                                        'LANDSAT_MSS1'=>'Landsat 1-3 MSS','LANDSAT_ETM_SLC_OFF1'=>'Landsat 4-8 Combined'), 'LANDSAT_8',array('class'=>'form-input')) }}

                                    </li>
                                </ul>
                                <span>Enter Date Range (required) </span>
                                <ul class="search-form row">
                                    <li>
                                        <span>Starting</span>
                                        <span class="sprite date-picker right"></span>
                                        {{Form::text('sceneStartTime','2013-05-29', array('size' => '10','maxlength'=>'10','alt'=>'Start Date Calendar','id'=>'sceneStartTime','class' => 'form-input'))}}                                       
                                    </li>
                                    <li>
                                        <b></b>
                                        <span>Ending</span>
                                        <span class="sprite date-picker right"></span>
                                        {{Form::text('sceneStopTime','2013-05-30', array('size' => '10','maxlength'=>'10','alt'=>'End Date Calendar','id'=>'sceneStopTime','class' => 'form-input'))}}                                             
                                    </li>
                                </ul>
                                {{ Form::checkbox('name', '',array('class' => 'form-input')); }}<span>Enter Path and Row (to enter a single path and row, fill out left column only) </span>
                                <ul class="search-form row">
                                    <li style="float:right; width:100%;">
                                        <span>Enter Cloud Cover</span>
                                        {{ Form::select('cloud_cover', array('10' => 'All', '1' => 'Less than 10%',
                                        '2'=>'Less than 20%','3'=>'Less than 30%','4'=>'Less than 40%',
                                        '5'=>'Less than 50%','6'=>'Less than 60%','7'=>'Less than 70%','8'=>'Less than 80%',
                                        '9'=>'Less than 90%'), 
                                        '10',array('size'=>'4','class'=>'form-input')) }}
                                    </li>
                                </ul>

                            </section>
                            {{Form::submit('Search',array('class'=>'button right'))}}
                        </div>
                    </li>
                </ul>
                {{Form::close()}}
            </div>
            <!--left side vertical box end here -->

            <!--right side vertical box start here -->
            <div class="right-content-box">
                <div class="result-main"> 
                    @if (isset($details) && count($details)>0)

                    {{ Form::open(array('url'=>'copy','method'=>'post')) }}

                    <ul class="row search-result">

                        @foreach ($details as $key=>$value)
                        {{--*/ $var = $value['img']  /*--}} 

                        <li class="col-lg-3 ">
                            <div class="select">
                                {{ Form::checkbox('name[]', $var); }}
                                <div class="search-img"><img src="{{ $value['img'] }}" width="160" height="160" alt="search"></div>
                                <div class="search-detail">

                                    <p>Sensor: {{ $value['sensor'] }}                                    </p>
                                    <p>Date: {{ $value['acquisitionDate'] }}</p>

                                    <p>Row: {{ $value['row'] }}</p>
                                    <p>Path: {{ $value['path'] }}</p>
                                    <p>Cloud Cover: {{ $value['cloud'] }}</p>
                                </div>
                            </div>
                        </li>
                        @endforeach







                    </ul>
                    <div class="clearboth"></div>
                    <div class="clearboth" style="margin:0 15px;">
                    This wont work for few min from now, Updation in progress  
                    {{Form::button('Request Scenes',array('id' => 'requestScenes','name' => 'submit','class'=>'button right'))}}   
                    {{--Form::submit('Request Scenes',array('name' => 'submit','class'=>'button right'))--}}                             
                    </div>
                    {{Form::close()}}
                    @else
                    <p>Sorry, no results</p>
                    @endif
                </div>
            </div>
            <!--right side vertical box end here -->

        </div>
    </div>
</section>
@stop
