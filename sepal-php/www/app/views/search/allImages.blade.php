
@section('sidebar')
@parent
@stop

@section('content')
<!--header wrap start-->
@include('includes.menu')
<!--header wrap end-->
{{ HTML::script('js/jquery.argonbox.js'); }}
<script type="text/javascript">

    $(document).on("keyup","#lat1,#long1,#lat2,#long2", function(){

        var lat1 = $.trim($("#lat1").val());
        var long1 =  $.trim($("#long1").val());
        var lat2 =  $.trim($("#lat2").val());
        var long2 =  $.trim($("#long2").val());

        if(($.trim(lat1).length>0) && ($.trim(lat2).length>0) && ($.trim(long1).length>0)
            && ($.trim(long2).length>0)){

            $("input[type='hidden'][name='topLeftLatitude']").val(lat1);
            $("input[type='hidden'][name='topLeftLongitude']").val(long1);
            $("input[type='hidden'][name='bottomRightLatitude']").val(lat2);
            $("input[type='hidden'][name='bottomRightLongitude']").val(long2);

        }else{


            $("input[type='hidden'][name='topLeftLatitude']").val("");
            $("input[type='hidden'][name='topLeftLongitude']").val("");
            $("input[type='hidden'][name='bottomRightLatitude']").val("");
            $("input[type='hidden'][name='bottomRightLongitude']").val("");

        }
    });

</script>
<script type="text/javascript">
    $(document).ready( function(){
        $("#alterSearch").click(function() {
            var beginPath = $.trim($("#beginPath").val());
            var endPath = $.trim($("#endPath").val());
            var beginRow = $.trim($("#beginRow").val());
            var endRow = $.trim($("#endRow").val());
            var lat1 = $.trim($("#lat1").val());
            var long1 = $.trim($("#long1").val());
            var lat2 = $.trim($("#lat2").val());
            var long2 = $.trim($("#long2").val());
            var latHidden1=$.trim($("#latHidden1").val());
            var longHidden1=$.trim($("#longHidden1").val());
            var latHidden2=$.trim($("#latHidden2").val());
            var longHidden2=$.trim($("#longHidden2").val());
            var cloudCover = $.trim($("#cloudCover").val());
            var datasetSelect= $.trim($("#datasetSelect").val());
            var sceneStartTime = $.trim($("#sceneStartTime").val());
            var sceneStopTime = $.trim($("#sceneStopTime").val());


            if(((beginPath != "") && (beginRow == "")) || ((beginRow != "")  && (beginPath == "")) || ((endPath != "") && (endRow == "")) || ((endRow != "" ) && (endPath == ""))){
                $(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
                //alert("");
                return false;
            }
            else if((beginPath != "") && (isNaN(beginPath) || (parseInt(beginPath) < 1) || (parseInt(beginPath) > 233))){

                $(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
                return false;
            }
            else if((beginRow != "") && (isNaN(beginRow) || (parseInt(beginRow) < 1) || (parseInt(beginRow) > 248))){
                $(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
                return false;
            }
            else if((endPath != "") && (isNaN(endPath) || (parseInt(endPath) < 1) || (parseInt(endPath) > 233))){
                $(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
                return false;
            }
            else if((endRow != "") && (isNaN(endRow) || (parseInt(endRow) < 1) || (parseInt(endRow) > 248))){
                $(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
                return false;
            }
            else if((beginPath!="") && (endPath!="") && ((parseInt(beginPath) > parseInt(endPath)))){
                $(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
                return false;
            }
            else if((beginRow!="") && (endRow!="") && ((parseInt(beginRow) > parseInt(endRow)))){
                $(".msg-box").html(' <p style="visibility: visible" class="error lat">The WRS Paths/Rows should be integers. The row value ranges from 1 to 248 and path value ranges from 1 to 233.Path and row should be specified in pairs</p>');
                return false;
            }

            else if((lat1 != "" && long1 == "") || (long1 != ""  && lat1 == "") || (lat2 != "" && long2 == "") || (long2 != ""  && lat2 == "")){
                $(".msg-box").html('<p style="visibility: visible" class="error lat">Longitude and Latitude should be numeric values,where latitude ranges from -90 to +90 and longitude ranges from -180 to 180.Either top left point or bottom right point should be specified</p>');
                return false;
            }
            else if(((lat1 != "") && (isNaN(lat1) ||(parseFloat(lat1) < -90) || (parseFloat(lat1) > 90)) )|| ((lat2 != "") && (isNaN(lat2) ||(parseFloat(lat2) < -90) || (parseFloat(lat2) > 90))) || ((long2 != "") && (isNaN(long2) || (parseFloat(long2) < -180) || (parseFloat(long2) > 180)))|| ((long1 != "") && (isNaN(long1) || (parseFloat(long1) < -180) || (parseFloat(long1) > 180)))){
                $(".msg-box").html('<p style="visibility: visible" class="error lat">Longitude and Latitude should be numeric values,where latitude ranges from -90 to +90 and longitude ranges from -180 to 180.Either top left point or bottom right point should be specified</p>');
                return false;
            }
            else if((latHidden1 != "" && longHidden1 == "") || (longHidden1 != ""  && latHidden1 == "") || (latHidden2 != "" && longHidden2 == "") || (longHidden2 != ""  && latHidden2 == "")){
                $(".msg-box").html('<p style="visibility: visible" class="error lat">Something went wrong. Please refresh the page and try again</p>');
                return false;
            }
            else if(((latHidden1 != "") && (isNaN(latHidden1) ||(parseFloat(latHidden1) < -90) || (parseFloat(latHidden1) > 90)) )|| ((latHidden2 != "") && (isNaN(latHidden2) ||(parseFloat(latHidden2) < -90) || (parseFloat(latHidden2) > 90))) || ((longHidden2 != "") && (isNaN(longHidden2) || (parseFloat(longHidden2) < -180) || (parseFloat(longHidden2) > 180)))|| ((longHidden1 != "") && (isNaN(longHidden1) || (parseFloat(longHidden1) < -180) || (parseFloat(longHidden1) > 180)))){
                $(".msg-box").html('<p style="visibility: visible" class="error lat">Something went wrong. Please refresh the page and try again</p>');
                return false;
            }
            else if(cloudCover!="" && cloudCover < 1 && cloudCover > 100 ){
                $(".msg-box").html('<p style="visibility: visible" class="error lat">A valid cloud cover value should be specified</p>');
                return false;
            }
            else if(datasetSelect=="" || (datasetSelect < 1 && datasetSelect > 8 )){
                $(".msg-box").html('<p style="visibility: visible" class="error lat">A valid dataset should be specified</p>');
                return false;
            }
            else if(((sceneStartTime != "") && (sceneStopTime == "")) || ((sceneStopTime != "")  && (sceneStartTime == "")) ){
                $(".msg-box").html('<p style="visibility: visible" class="error lat">Both start date and end date are required</p>');
                return false;
            }
            else if((new Date(sceneStartTime).getTime() > new Date(sceneStopTime).getTime())){
                $(".msg-box").html('<p style="visibility: visible" class="error lat">Start date should be less than end date</p>');
                return false;
            }
            return true;

        });
        $('#selectAll').click(function(){
            if($(this).val()=='Deselect All'){
                $(this).val('Select All');
                $('.sceneName').prop('checked', false);
                $('.parentScreens ').removeClass("select");
            }
            else{
                $(this).val('Deselect All');
                $('.sceneName').prop('checked', true);
                $('.parentScreens ').addClass("select");
            }
        });
    });
</script>
<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/{{ HTML::link('#', 'Search Results') }}</li>
        </ul>

        <div class="help-div right">
            {{ HTML::link('search', 'Reset Search',array('class'=>'button pull-left','style'=>'margin: 0 5px 0')) }}
            <a href="javascript:void(0)" id="help-button" class="sprite help-icon pull-right"></a>
        </div>
    </div>
</section>
<!--popup loading div start here -->
<div class="popup-wrap" id="help-popup-wrap" style="display: none;">
    <div class="popup-container">
        <a class="close close-btn" id="help-close-button" href="#">x</a>
        <div class="popup-heading"><h5 class="text-left">Search Results</h5></div>
        <p class="text-left marg-no">Thumbnail images for all entries in the results of the most recent query are shown below. The query can be updated by changing the data in the search interface on the left and clicking 'Search'. You can return to the search page by clicking the reset button.</p>
        <p class="text-left marg-no">The metadata information (Scene ID, Sensor, Path/Row, Acquisition Date, and Cloud Cover) for each scene is shown below the thumbnail image. Users can sort the set of results based on the Path, Row, Acquisition Date, or Cloud Cover. Clicking on an image will pop up a full resolution version of the browse image. Clicking on the checkbox will flag the image and clicking on the Request Scenes button will copy all flagged images to the user's working directory. This process may take a significant amount of time depending on the quantity of requested data.</p>
    </div>
</div>
<!--popup loading div end here -->
<!--content wrap start-->
<section class="content-wrap">
    <div class="container">


        <div class="box-wrap search-result-wrap">

            <!--left side vertical box start here -->
            <div class="left-search-box">
                {{--*/ $identifier = ''  /*--}}
                {{--*/ $beginPath = ''  /*--}}
                {{--*/ $endPath = ''  /*--}}
                {{--*/ $beginRow = ''  /*--}}
                {{--*/ $endRow = ''  /*--}}
                {{--*/ $upperLeftCornerLatitude = ''  /*--}}
                {{--*/ $upperLeftCornerLongitude = ''  /*--}}
                {{--*/ $lowerRightCornerLatitude = ''  /*--}}
                {{--*/ $lowerRightCornerLongitude = ''  /*--}}
                {{--*/ $upperLeftCornerLatitude01 = ''  /*--}}
                {{--*/ $upperLeftCornerLongitude01 = ''  /*--}}
                {{--*/ $lowerRightCornerLatitude01 = ''  /*--}}
                {{--*/ $lowerRightCornerLongitude01 = ''  /*--}}
                {{--*/ $sensor = ''  /*--}}
                {{--*/ $selectedSensor = ''  /*--}}
                {{--*/ $sceneStartTime = ''  /*--}}
                {{--*/ $sceneStopTime = ''  /*--}}
                {{--*/ $name = ''  /*--}}
                {{--*/ $specificMonths = ''  /*--}}
                {{--*/ $cloud_cover = '' /*--}}
                {{--*/ $sortby = '' /*--}}
                @if (isset($search))
                {{--*/ $identifier = $search['identifier']  /*--}}
                {{--*/ $beginPath = $search['beginPath']  /*--}}
                {{--*/ $endPath = $search['endPath']  /*--}}
                {{--*/ $beginRow = $search['beginRow']  /*--}}
                {{--*/ $endRow = $search['endRow']  /*--}}
                {{--*/ $upperLeftCornerLatitude = $search['topLeftLatitude']  /*--}}
                {{--*/ $upperLeftCornerLongitude = $search['topLeftLongitude']  /*--}}
                {{--*/ $lowerRightCornerLatitude = $search['bottomRightLatitude']  /*--}}
                {{--*/ $lowerRightCornerLongitude = $search['bottomRightLongitude']  /*--}}
                {{--*/ $upperLeftCornerLatitude01 = $search['topLeftLatitude01']  /*--}}
                {{--*/ $upperLeftCornerLongitude01 = $search['topLeftLongitude01']  /*--}}
                {{--*/ $lowerRightCornerLatitude01 = $search['bottomRightLatitude01']  /*--}}
                {{--*/ $lowerRightCornerLongitude01 = $search['bottomRightLongitude01']  /*--}}
                {{--*/ $sensor = $search['sensor']  /*--}}
                {{--*/ $sceneStartTime = $search['sceneStartTime']  /*--}}
                {{--*/ $sceneStopTime = $search['sceneStopTime']  /*--}}
                {{--*/ $name = $search['name']  /*--}}
                {{--*/ $sortby = $search['sortby']  /*--}}
                @if($name==1)
                {{--*/ $specificMonths=true /*--}}
                @else
                {{--*/ $specificMonths = false /*--}}
                @endif
                {{--*/ $cloud_cover = $search['cloud_cover']  /*--}}
                @endif
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
                                    <div class="web-accordion-toggle" area="path"><span class="sprite toggle-arrow"></span>Path/Row</div>
                                    @if (((strlen($beginPath)>0)|| (strlen($endPath)>0) ||(strlen($beginRow)>0) || (strlen($endRow)>0))&& $identifier==1)
                                    <div class="web-accordion-content">
                                        @else
                                        <div class="web-accordion-content" style="display:none">
                                            @endif
                                            {{Form::hidden('identifier',$identifier,$attributes = array('id' => 'identifier'))}}
                                            <span>Enter Path and Row (to enter a single path and row, fill out left column only) </span>
                                            <div class="clearfix"></div>
                                            <ul class="search-form row">
                                                <li>
                                                    <span>WRS Path</span>
                                                    {{Form::text('beginPath',$beginPath,$attributes = array('class' => 'form-input','id'=>'beginPath','autocomplete' => 'off'))}}
                                                </li>
                                                <li>
                                                    <b></b>
                                                    <span>to</span>
                                                    {{Form::text('endPath',$endPath,$attributes = array('class' => 'form-input','id'=>'endPath','autocomplete' => 'off'))}}
                                                </li>
                                                <li>
                                                    <span>WRS Row</span>
                                                    {{Form::text('beginRow',$beginRow,$attributes = array('class' => 'form-input','id'=>'beginRow','autocomplete' => 'off'))}}
                                                </li>
                                                <li>
                                                    <b></b>
                                                    <span>to</span>
                                                    {{Form::text('endRow',$endRow,$attributes = array('class' => 'form-input','id'=>'endRow','autocomplete' => 'off'))}}
                                                </li>
                                            </ul>
                                        </div>

                                        <div class="web-accordion-toggle" area="lat"><span class="sprite toggle-arrow"></span>Lat/Long</div>
                                        @if (((strlen($upperLeftCornerLatitude)>0)|| (strlen($upperLeftCornerLongitude)>0) ||(strlen($lowerRightCornerLatitude)>0) || (strlen($lowerRightCornerLongitude)>0))&& $identifier==2)
                                        <div class="web-accordion-content">
                                            @else
                                            <div class="web-accordion-content" style="display:none">
                                                @endif
                                                <span>Enter Longitude/Latitude  </span>
                                                <div class="clearfix"></div>
                                                <ul class="search-form row">
                                                    <li>
                                                        <span>1.Latitude</span>
                                                        {{Form::text('topLeftLatitude01',((isset($upperLeftCornerLatitude)&& trim($upperLeftCornerLatitude)!='')?$upperLeftCornerLatitude:$upperLeftCornerLatitude01),$attributes = array('class' => 'form-input','id'=>'lat1','autocomplete' => 'off'))}}

                                                    </li>
                                                    <li>
                                                        <b></b>
                                                        <span>Longitude</span>
                                                        {{Form::text('topLeftLongitude01',((isset($upperLeftCornerLongitude)&& trim($upperLeftCornerLongitude)!='')?$upperLeftCornerLongitude:$upperLeftCornerLongitude01),$attributes = array('class' => 'form-input','id'=>'long1','autocomplete' => 'off'))}}
                                                    </li>
                                                    <li>
                                                        <span>2.Latitude</span>
                                                        {{Form::text('bottomRightLatitude01',((isset($lowerRightCornerLatitude)&& trim($lowerRightCornerLatitude)!='')?$lowerRightCornerLatitude:$lowerRightCornerLatitude01),$attributes = array('class' => 'form-input','id'=>'lat2','autocomplete' => 'off'))}}
                                                    </li>
                                                    <li>
                                                        <b></b>
                                                        <span>Longitude</span>
                                                        {{Form::text('bottomRightLongitude01',((isset($lowerRightCornerLongitude)&& trim($lowerRightCornerLongitude)!='')?$lowerRightCornerLongitude:$lowerRightCornerLongitude01),$attributes = array('class' => 'form-input','id'=>'long2','autocomplete' => 'off'))}}
                                                        <div class="clearfix"></div>
                                                        <button id="clearlatLong"class="button right">Clear</button>
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
                                                <ul class="search-form row">
                                                    <li style="float:right;width:100%;">
                                                        <span>Choose a dataset</span>
                                                        {{ Form::select('sensor', $datasetList, $sensor,array('class'=>'form-input','id'=>'datasetSelect')) }}

                                                    </li>
                                                </ul>
                                                <span>Enter Date Range (required) </span>
                                                <ul class="search-form row">
                                                    <li>
                                                        <span>Starting</span>
                                                        <span class="sprite date-picker right"></span>
                                                        {{Form::text('sceneStartTime',$sceneStartTime, array('placeholder' => 'YYYY-MM-DD','size' => '10','maxlength'=>'10','alt'=>'Start Date Calendar','id'=>'sceneStartTime','class' => 'form-input','autocomplete'=>'off'))}}
                                                    </li>
                                                    <li>
                                                        <b></b>
                                                        <span>Ending</span>
                                                        <span class="sprite date-picker right"></span>
                                                        {{Form::text('sceneStopTime',$sceneStopTime, array('placeholder' => 'YYYY-MM-DD','size' => '10','maxlength'=>'10','alt'=>'End Date Calendar','id'=>'sceneStopTime','class' => 'form-input','autocomplete'=>'off'))}}
                                                    </li>
                                                </ul>
                                                {{ Form::checkbox('name', 1,$specificMonths,array('class' => 'form-input')); }}<span>Search these months only (ex. 03/12/2008-05/15/2009 will return records for March, April and May of 2008 and 2009) </span>
                                                <ul class="search-form row">
                                                    <li style="float:right; width:100%;">
                                                        <span>Enter Cloud Cover</span>
                                                        {{ Form::select('cloud_cover', array('100' => 'All', '10' => 'Less than 10%',
                                                        '20'=>'Less than 20%','30'=>'Less than 30%','40'=>'Less than 40%',
                                                        '50'=>'Less than 50%','60'=>'Less than 60%','70'=>'Less than 70%','80'=>'Less than 80%',
                                                        '90'=>'Less than 90%'),
                                                        $cloud_cover,array('class'=>'form-input','id'=>'cloudCover')) }}
                                                    </li>
                                                </ul>

                                            </section>

                                            {{Form::submit('Search',array('class'=>'button right','id'=>'alterSearch'))}}
                                        </div>
                                    </li>
                                    </ul>
                                    {{Form::hidden('topLeftLatitude',$upperLeftCornerLatitude,$attributes = array('id' => 'latHidden1'))}}
                                    {{Form::hidden('topLeftLongitude',$upperLeftCornerLongitude,$attributes = array('id' => 'longHidden1'))}}
                                    {{Form::hidden('bottomRightLatitude',$lowerRightCornerLatitude,$attributes = array('id' => 'latHidden2'))}}
                                    {{Form::hidden('bottomRightLongitude',$lowerRightCornerLongitude,$attributes = array('id' => 'longHidden2'))}}
                                    {{Form::close()}}
                                </div>
                                <!--left side vertical box end here -->

                                <!--right side vertical box start here -->
                                <div class="right-content-box">

                                    <div class="result-main">

                                        <div class="msg-box"></div>
                                        @if (isset($details) && count($details)>0)

                                        <div class="pagination-wrap">

                                            <div style="margin-bottom:15px" class="pull-right">
                                                <span style="padding-right:5px; padding-top:5px" class="pull-left">Sort by : </span>
                                                <span class="pull-left">

                                                    {{ Form::select('sortby', array(' ' => '-select-',
                                                    'acquisitionDate-asc'=>'&uarr;Acquisition Date',
                                                    'acquisitionDate-desc'=>'&darr;Acquisition Date',
                                                    'path-asc'=>'&uarr;Path',
                                                    'path-desc'=>'&darr;Path',
                                                    'row-asc'=>'&uarr;Row',
                                                    'row-desc'=>'&darr;Row',
                                                    'cloudCoverFull-asc'=>'&uarr;Cloud Cover',
                                                    'cloudCoverFull-desc'=>'&darr;Cloud Cover'
                                                    ), 
                                                    $sortby,array('class'=>'form-input sortby','id'=>'sortby')) }}



                                                </span>
                                                <input type="button" class="button right" id="selectAll" value="Select All" style="margin-top: 2px; margin-left: 10px;">
                                            </div>
                                            <div class="clearboth"></div>
                                        </div>




                                        {{ Form::open(array('url'=>'migrate','method'=>'post')) }}
                                        <ul class="row search-result screengrid argonbox">
                                            @foreach ($details as $key=>$value){{--*/$sceneId = $value['name']/*--}}{{--*/ $imageName = $value['name'].$value['extension']  /*--}}
                                            <li class="col-lg-3 " data-dataset-id="{{$value['dataset_id']}}">
                                                <div class="parentScreens">
                                                   {{--*/ $datasetID= $value['dataset_id']/*--}}
                                                    {{ Form::checkbox('sceneName[]', $sceneId.'-'.$datasetID,null,array('class'=>'sceneName','id'=>'checkbox_img'.$key)); }}
                                                    <div class="search-img" style="text-align:center">

                                                        <div class="imageName" style="display:none;">{{$imageName}}</div>
                                                        <div class="imageUrl" style="display:none;">{{$value['img']}}</div>

                                                        <a class="sdmsRepoHigh" href="" title="{{$imageName}}" alt="{{$imageName}}">
                                                            <img src="images/loader.gif" class="sdmsRepo" style="width:auto;" alt="search">
                                                        </a>
                                                    </div>
                                                    <div class="search-detail">
                                                        <p>Scene ID: {{ $value['name'] }}</p>
                                                        <p>Sensor: {{ $value['sensor'] }}</p>
                                                        <p>Date: {{ $value['acquisitionDate'] }}</p>
                                                        <p>Path: {{ $value['path'] }}</p>
                                                        <p>Row: {{ $value['row'] }}</p>
                                                        <p>Cloud Cover : {{ $value['cloud'] }}</p>
                                                    </div>
                                                </div>
                                            </li>@endforeach
                                        </ul>
                                        <div class="clearboth"></div>
                                        <div class="clearboth" style="margin:0 15px;">
                                            <b style="display : none;color:red;">This wont work for few min from now, Updation in progress</b>
                                            {{--Form::submit('Request Scenes',array('name' => 'submit','class'=>'button right'))--}}
                                            <div style="margin:0 15px;" class="clearboth">
                                                {{Form::button('Request Scenes',array('id' => 'requestScenes','name' => 'submit','class'=>'button right'))}}
                                                <select id="processingScript" style="width: auto; margin: 5px 10px 0 0" class="right">
                                                    <option value="">No pre-processing</option>
                                                    @foreach ($processingScripts as $script=>$scriptName)
                                                    <option value="{{$script}}">{{$scriptName}}</option>
                                                    @endforeach
                                                </select>

                                            </div>
                                        </div>
                                        {{Form::close()}}

                                         <!-- HERE IS THE PAGINATION in E:// sdms live nimmy -->

                                        <div class="pagination-wrap">
                                            <span class="pull-left">
                                            Displaying {{ $pageLink['getFrom'] }} 
                                            -
                                            {{ $pageLink['getTo'] }} of {{ number_format($pageLink['getTotalResult']) }} results</span>
                                            <div class="clearboth"></div>
                                            {{$pageLink['link'] }}


                                        </div>




                                        @elseif(isset($details) && count($details)==0)

                                        <ul class="row search-result">

                                            <li>
                                                <p>Sorry, no results</p>

                                            </li>
                                        </ul>
                                        @elseif(isset($movedImages))
                                        <ul class="row search-result">

                                            <li>
                                                <p>Please check your folder</p>
                                            </li>
                                        </ul>
                                        @endif
                                    </div>
                                </div>
                                <!--right side vertical box end here -->

                        </div>
                        </div>
                        </section>
                        {{ HTML::style( asset('css/style.argonbox.css') ) }}
                        {{ HTML::script('js/jquery.argonbox.js'); }}

                        {{ HTML::script('js/jquery-ui.js'); }}
                        {{ HTML::script('js/jquery.maskedinput.js'); }}
                        {{ HTML::style( asset('css/jquery-ui.css') ) }}
                        <script>
                            jQuery( "#sceneStartTime,#sceneStopTime" ).datepicker({
                                dateFormat: 'yy-mm-dd'
                            }).mask('9999-99-99');

                        </script>

                            @stop
