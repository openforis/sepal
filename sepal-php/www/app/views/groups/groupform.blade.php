@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'group'))
<!--header wrap end-->


form
<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/{{ HTML::link('groups', 'Manage Groups') }}</li>
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
        <h5 class="text-left">Heading</h5>
        <p class="text-left marg-no">Lorem Ipsum is simply dummy text of the printing and typesetting industry</p>
    </div>
</div>
<!--popup loading div end here -->
<!--content wrap start-->
<section>
    <div class="sec-second-row">
        <div class="form-wrap">
            <h3>New Group</h3>
            <br />

            {{ Form::open(array('url'=>'add','method'=>'post')) }}
            <ul>
                <li>
                    <span style="margin:0;">Group Name<sup>*</sup>&nbsp;&nbsp;:</span>
                    {{Form::text('groupName',$value = Input::old('groupName'),$attributes = array('first' => 'group name'))}}
                    @if ($errors->has('groupName')) <p class="error">{{ $errors->first('groupName') }}</p> @endif
                </li>
                <li>
                    <span style="margin:0;">Group Description<sup>*</sup>&nbsp;&nbsp;:</span>
                    {{Form::textarea ('groupDescription',$value = Input::old('groupDescription'), $attributes = array("rows"=>"5"))}}
                    @if ($errors->has('groupDescription')) <p class="error">{{ $errors->first('groupDescription') }}</p> @endif
                </li>

            </ul>

            <div class="clearfix"></div>

            <div class="sec-finel-row">
                {{Form::submit('Save',array('class'=>'smallbuttonblue button'))}}
                {{Form::close()}} 
            </div>
        </div>            
    </div>

    <div class="clearfix"></div>
    <div class="sec-second-row">
        <div class="scrool_main">
            <div class="scrool">

            </div>
        </div>  
        <div class="clearfix"></div>
    </div>    
</section>
<!--content wrap end-->
@stop 
