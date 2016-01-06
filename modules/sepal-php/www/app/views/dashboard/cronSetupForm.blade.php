@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'group'))
<!--header wrap end-->

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/{{ HTML::link('cronsetupbydays', 'Age of System Data') }}</li>
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
                <div class="popup-heading"><h5 class="text-left">System Utilities</h5></div>
                <p class="text-left marg-no">This page serves as the interface to the tools available for the system administrators to help manage SEPAL. Two tools exist to help manage the system storage requirements. The first tool controls how long downloaded images will remain in the system's primary repository without being requested before they are deleted. The length of time (in days) can be specified in the interface below. The second tool provides an interface to control the default size of a new user's working directory. The specification of size is done in GBs and all users added after the size has been changed will have working directories of the new size.</p>
            </div>
        </div>
        <!--popup loading div end here -->
       <!--content wrap start-->
        <section class="content-wrap">
            <div class="container">
            {{ Form::open(array('url'=>'cronsetupbydays','method'=>'post')) }}

            <h2>Age of System Data</h2>
                <div class="box-wrap" style="padding-top:15px;">
                    <ul class="row">                        
                        <li class="col-lg-8">
                            <ul class="contact-form">
                            @foreach ($cronDetailDb as $cronValue )
                               <li>
                               <span class="width-5">Number of days to keep previously downloaded scenes in the SEPAL archive</span>
                               {{Form::text('cronDate',$value = (Input::old('cronDate')?Input::old('cronDate'):(isset($cronValue->value)?$cronValue->value:''))
                        ,array('id'=>'cronDate','class'=>'form-input width-5'))}}
                               </li>
                               @if ($errors->has('cronDate'))
                               <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('cronDate') }}</p></li>
                               @endif
                            @endforeach   
                          </ul>
                            <div class="clearfix"></div>
                            {{Form::submit('Save',array('class'=>'smallbuttonblue button'))}}
                            <div class="clearfix"></div>
                            <div class="msg-box" style="display:none;"><p class="success" style="text-align:center; visibility:visible">The password field is required.</p></div>
                        </li>
                    </ul>                   
                </div>
                {{Form::close()}} 
            </div>
        </section>
        <!--content wrap end-->
@stop 
