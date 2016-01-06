<!DOCTYPE html>
<!--[if lt IE 8]><html lang="en" class="no-js lt-ie10 lt-ie9 lt-ie8"><![endif]-->
<!--[if IE 8]><html lang="en" class="no-js ie8 lt-ie10 lt-ie9"><![endif]-->
<!--[if IE 9]><html lang="en" class="no-js ie9 lt-ie10"><![endif]-->
<!--[if gt IE 9]><!-->
<html lang="en" class="no-js">
    <!--<![endif]-->
    <head>

        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <title>SEPAL :: {{{ isset($title) ? $title : 'Space Data Management System' }}} {{{ SdmsConfig::value('version')  }}}</title>
        <meta name="keywords" content="">
        <meta name="description" content="">
        <!-- Bootstrap -->

        {{ HTML::style( asset('css/bootstrap.css') ) }}  
        {{ HTML::style( asset('css/common.css') ) }} 
        {{ HTML::style( asset('css/login.css') ) }} 
        {{ HTML::script('js/jquery.js'); }} 
        {{ HTML::script('js/script.js'); }}
        {{ HTML::script('js/bootstrap.js'); }}


        <!-- HTML5 Shim and Respond.js IE8 support of HTML5 elements and media queries -->
        <!-- WARNING: Respond.js doesn't work if you view the page via file:// -->
        <!--[if lt IE 9]>
         {{ HTML::script('js/html5shiv.js'); }}
        {{ HTML::script('js/respond.min.js'); }}
        <![endif]-->


    </head>
    <body>

      	
        <div id="wrap" class="main-wrap">

            @yield('content')      	

        </div> 

        <!--footer wrap start-->
        <section id="footer" class="footer-wrap">
            <div class="container">
                <footer>
                    <span class="copy-right"><!--Copyright    sdms 2014--></span>
                    <script type="text/javascript">
                        //alert(5);
                        $(document).ready(function(){
                            $("#help-button").click(function() {
                                $("body").css('overflow','hidden');
                                $("#help-popup-wrap").fadeIn("slow");
                            });
                
                            $("#help-close-button").click(function() {
                                //$(".popup-wrap").css('display','none');
                                 $("#help-popup-wrap").fadeOut("slow");
                                 $("body").css('overflow','visible');
                            });
                        });
            
                    </script>
                </footer>
            </div>
        </section>
        <!--footer wrap end-->


    </body>
</html>
