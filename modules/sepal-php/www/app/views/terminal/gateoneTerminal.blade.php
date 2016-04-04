<!-- Bootstrap -->
<html lang="en" class="no-js">
<!--<![endif]-->
<head>
    {{ HTML::style( asset('css/gateone.css') ) }}
    {{ HTML::script('js/jquery.js'); }}
    {{ HTML::script('js/gateone.js'); }}
    <title>SEPAL - Terminal</title>
    <style>
        #go_default_noticecontainer {
            display: none !important;
        }
    </style>
    <script type="text/javascript">
        $(document).ready(function () {
            $.getJSON("https://{{SdmsConfig::value('host')}}/terminalData")
                .done(
                    function (data) {
                        var response = data;
                        var terminalUri = "{{SdmsConfig::value('hostSSH')}}";
                        var authObject = response.authObject;
                        var registeredCloseCallback = false

                        function initTerminal() {
                            var terminalCount = GateOne.Terminal.terminals.count();
                            for (var i = 0; i < terminalCount; i++)
                                GateOne.Terminal.closeTerminal(i);
                            GateOne.Terminal.newTerminal()
                        }

                        GateOne.Events.on("go:js_loaded", function () {
                            if (!registeredCloseCallback) {
                                GateOne.Terminal.closeTermCallbacks.push(function () {
                                    initTerminal();
                                })
                                registeredCloseCallback = true
                            }

                            initTerminal();
                        });
                        GateOne.Utils.deleteCookie('gateone_user', '/', ''); // Deletes the 'gateone_user' cookie
                        GateOne.init({
                            audibleBell: false,
                            auth: authObject,
                            autoConnectURL: 'ssh://{{Session::get("username")}}@' + terminalUri + '?identities=id_rsa',
                            disableTermTransitions: true,
                            embedded: true,
                            url: "{{SdmsConfig::value('gateOneURI')}}",
                            showTitle: false,
                            showToolbar: false,
                            style: {}
                        });
                    }
                );
        });
    </script>
</head>
<body>
<div id="gateone"></div>
</body>
</html>