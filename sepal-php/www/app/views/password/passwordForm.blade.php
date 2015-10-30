@section('content')
<!--header wrap start-->
@include('includes.menu')
<!--header wrap end-->

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li><a href="#">Dashboard</a></li>
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
<section class="content-wrap">
    <div class="container ">


        <div class="box-wrap change-pass-wrap">
            {{ Form::open(array('url' => 'password', 'method' => 'post')) }}
            <ul class="row">
                <li class="col-lg-12">
                    <div class="col-content">
                        <section class="border-box padd20">
                            <h2>Change Password</h2>
                            <ul class="forgot-pass-form">


                                @if (isset($message)) 
                                <li class="msg-box"><p class="error" style="visibility:visible">{{ $message }}</p></li> @endif

                                @if ($errors->has('oldPassword')) 
                                <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('oldPassword') }}</p></li> @endif
                                <li>

                                    <span>Old Password</span>
                                    {{Form::password('oldPassword') }}               
                                </li>
                                @if ($errors->has('newPassword')) 
                                <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('newPassword') }}</p></li> @endif
                                <li>
                                    <span>New Password</span>
                                    {{Form::password('newPassword') }}               
                                </li>

                                @if ($errors->has('repPassword')) 
                                <li class="msg-box"><p class="error" style="visibility:visible">{{ $errors->first('repPassword') }}</p></li> @endif
                                <li>
                                    <span>Confirm Password</span>
                                    {{Form::password('repPassword') }}         
                                    <span class="sprite login-btn">

                                </li>                                 <li>

                                    {{Form::submit('Submit',array('name' => 'submit','class'=>'button right'))}}
                                    <div class="clearfix"></div>
                                </li>



                            </ul>                                    
                        </section>

                    </div>
                </li>
            </ul>  
            {{Form::close()}}              	
        </div>
    </div>
</section>
<!--content wrap end-->	


<!--content wrap end-->
@stop 

