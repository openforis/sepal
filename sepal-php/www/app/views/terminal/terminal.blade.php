@section('content')
<!--header wrap start-->
@include('includes.menu',array('current_page'=>'terminal'))

<!--header wrap end-->

<section class="breadcrumb">
    <div class="container">
        <ul class="bread-crumb left">
            <li>{{ HTML::link('dashboard', 'Dashboard') }}/{{ HTML::link('terminal', 'Terminal') }}</li>
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
                <div class="popup-heading"><h5 class="text-left">Terminal</h5></div>
                <p class="text-left marg-no">The terminal interface below is a direct connection to a Linux operating environment in which the user can manipulate and process satellite images. Users must provide their login credentials again to access the terminal interface. The terminal interface is restricted to text only display.</p>
            </div>
        </div>
        <!--popup loading div end here -->
<!--content wrap start-->
<section class="content-wrap">
    <div class="container">
  

        <div class="terminal-wrap">
        <header>
                        <span>SEPAL: Terminal</span>
                        <div class="new-wdw-btn"><a target="_blank" href="/shellinabox">Open in a new Window</a></div>
                        <div class="window-btn"><a class="sprite" href="javascript:void(0)"></a></div>
        </header>
            <div class="terminal-content">
	<iframe src="/shellinabox" width="100%" height="400px" border=0>

</iframe>   
            </div>
        </div>
    </div>
</section>
<!--content wrap end-->
@stop 
