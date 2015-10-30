@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'contact'))
<!--header wrap end-->

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/{{ HTML::link('contact', 'Contact us') }}</li>
        </ul>                
        <div class="help-div right">
           <!-- <a href="javascript:void(0)" id="help-button" class="sprite help-icon"></a>-->
        </div>  
    </div>
</section>
<!--popup loading div start here -->
<!--<div class="popup-wrap" id="help-popup-wrap" style="display: none;">
    <div class="popup-container">
        <a class="close close-btn" id="help-close-button" href="#">x</a>
        <h5 class="text-left">Heading</h5>
        <p class="text-left marg-no">Lorem Ipsum is simply dummy text of the printing and typesetting industry</p>
    </div>
</div>-->
<!--popup loading div end here -->
<!--content wrap start-->
<section class="content-wrap">
    <div class="container">		
        <div class="box-wrap" style="padding-top:15px;">
            <ul class="row">                    	
                <li class="col-lg-6">
                    @if(isset($movedImages))
                    <div class="msg-box"><p class="success" style="text-align:center;visibility: visible">{{ $movedImages }}</p></div>
                    @endif
                    <ul class="contact-form">
                        {{ Form::open(array('url'=>'contact','method'=>'post','files'=>'true')) }}
                        <li>
                            <span>Name: *</span>
                            {{Form::text('contactName','',$attributes = array('class' => 'form-input','id'=>'contactName','autocomplete' => 'off'))}}

                        </li>
                        <li class="msg-box"> @if ($errors->has('contactName')) <p class="error" style="visibility: visible">{{ $errors->first('contactName') }}</p> @endif
                        </li>
                        <li>
                            <span>Email: *</span>
                            {{Form::text('contactEmail','',$attributes = array('class' => 'form-input','id'=>'contactEmail','autocomplete' => 'off'))}}

                        </li>

                        <li class="msg-box"> @if ($errors->has('contactEmail')) <p class="error" style="visibility: visible">{{ $errors->first('contactEmail') }}</p> @endif
                        </li>
                        <li>
                            <span>Phone: *</span>
                            {{Form::text('contactPhone','',$attributes = array('class' => 'form-input','id'=>'contactPhone','autocomplete' => 'off'))}}

                        </li>
                        <li class="msg-box">  @if ($errors->has('contactPhone')) <p class="error" style="visibility: visible">{{ $errors->first('contactPhone') }}</p> @endif
                        </li>
                        <li>
                            <span>Message:</span>
                            {{Form::textarea('contactMessage','',$attributes = array('class' => 'form-input','id'=>'contactMessage','style'=>'height:150px;'))}}

                        </li>
                        <li>
                            <span>Security Test: *</span>

                            <div class="captcha-wrap">
                                <span>Type the characters you see in the picture</span>                                    
                                <br>
                                <img src="{{Captcha::getImage("8", "220", "70","FFFFFF","100")}}">
                                {{Form::text('userCaptcha','',$attributes = array('class' => 'form-input','id'=>'userCaptcha','autocomplete' => 'off'))}}
                            </div>                          
                        </li>
                        <li class="msg-box">  @if ($errors->has('userCaptcha')) <p class="error" style="visibility: visible">{{ $errors->first('userCaptcha') }}</p> @endif
                        </li>

                    </ul>
                    <div class="clearfix"></div>
                    {{Form::submit('Send',array('class'=>'button right'))}}
                    {{Form::close()}}
                    <div class="clearfix"></div>


                </li>
                <li class="col-lg-6">
                    <div class="col-content">
                        <section class="border-box padd20">
                            <ul class="contact-form">
                                <li style="float:right;width:100%;">
                                    <h4>Phone</h4>
                                    <img src="images/conatct-number.png" width="120" height="14" alt="contact-number">
                                </li>
                                <li style="float:right;width:100%;">
                                    <h4>Email</h4>
                                    <img src="images/contact-email.png" width="147" height="14" alt="contact-email">
                                </li>
                                <li style="float:right;width:100%;">
                                    <h4>Address</h4>
                                    <p>Erik Lindquist</p>
                                    <p>Forestry Officer</p>
                                    <p>United Nations Food and Agriculture Organization</p>
                                    <p>Rome,</p>
                                    <p>Italy 00154</p>
                                </li>
                            </ul>
                        </section>
                    </div>
                </li>
            </ul>                	
        </div>


    </div>
</section>
<!--content wrap end-->
@stop 
