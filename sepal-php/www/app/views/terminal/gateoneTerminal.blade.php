<!-- Bootstrap -->
<html lang="en" class="no-js">
    <!--<![endif]-->
    <head>
    {{ HTML::style( asset('css/bootstrap.css') ) }}
    {{ HTML::style( asset('css/common.css') ) }}
    {{ HTML::style( asset('css/gateone.css') ) }}
    {{ HTML::script('js/jquery.js'); }}
    {{ HTML::script('js/gateone.js'); }}
    {{ HTML::script('js/script.js'); }}
    {{ HTML::script('js/bootstrap.js'); }}
    {{ HTML::script('js/lodash.js'); }}
    {{ HTML::script('js/jquery.dateFormat.min.js'); }}
    <title>SEPAL - Terminal</title>
    <style>
        A.resetTerminal{
            color:white;
        }

        A.resetTerminal:hover{
            text-decoration: underline;
        }
    </style>
    <script type="text/javascript">
        $(document).ready(function () {
            $.getJSON("https://{{SdmsConfig::value('host')}}/terminalData")
            .done(
                function(data){
                    var response = data;
                    var terminalUri = "{{SdmsConfig::value('hostSSH')}}";
                    var authObject = response.authObject;
                    var autoConnectURL = 'ssh://{{Session::get("username")}}@' + terminalUri + '?identities=id_rsa';
                    GateOne.prefs.autoConnectURL = autoConnectURL;
                    GateOne.prefs.disableTermTransitions = true;
                    GateOne.prefs.showToolbar = false;
                    GateOne.prefs.skipChecks = true;
                    GateOne.noSavePrefs = {
                        url: null,
                        webWorker: null,
                        fillContainer: null,
                        style: null,
                        goDiv: null,
                        prefix: null,
                        autoConnectURL: null,
                        embedded: null,
                        auth: null,
                        showTitle: null,
                        showToolbar: null,
                        rowAdjust: null,
                        colAdjust: null
                    }
                    GateOne.Utils.deleteCookie('gateone_user', '/', ''); // Deletes the 'gateone_user' cookie
                    var doInit = function () {
                    GateOne.Base.superSandbox("NewExternalTerm", ["GateOne.Terminal", "GateOne.Terminal.Input"], function(window, undefined) {
                            "use strict";

                            });
                        };
                    GateOne.init({auth: authObject, url: "{{SdmsConfig::value('gateOneURI')}}", style: {}},doInit);

                }
            );
        });
    </script>
    </head>
    <body>
        <div id="gateone"></div>
    </body>
</html>