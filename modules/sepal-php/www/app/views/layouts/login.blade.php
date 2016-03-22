<!DOCTYPE html>
<!--[if lt IE 8]><html lang="en" class="no-js lt-ie10 lt-ie9 lt-ie8"><![endif]-->
<!--[if IE 8]><html lang="en" class="no-js ie8 lt-ie10 lt-ie9"><![endif]-->
<!--[if IE 9]><html lang="en" class="no-js ie9 lt-ie10"><![endif]-->
<!--[if gt IE 9]><!-->
l<html lang="en" class="no-js">
    <!--<![endif]-->
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
        <title>SEPAL :: {{{ isset($title) ? $title : 'Space Data Management System' }}} {{{ SdmsConfig::value('version')  }}}</title>
        <meta name="keywords" content="Space Data Management System">
        <meta name="description" content="Space Data Management System">
        {{ HTML::style( asset('css/bootstrap.css') ) }}
        {{ HTML::style( asset('css/login.css') ) }}
          <!-- HTML5 Shim and Respond.js IE8 support of HTML5 elements and media queries -->
        <!-- WARNING: Respond.js doesn't work if you view the page via file:// -->
        <!--[if lt IE 9]>
         {{ HTML::script('js/html5shiv.js'); }}
        {{ HTML::script('js/respond.min.js'); }}
        <![endif]-->
    </head>
    <body>
        @yield('content')
    </body>
</html>
