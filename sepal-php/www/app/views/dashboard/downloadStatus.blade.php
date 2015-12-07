<!-- Bootstrap -->
<html lang="en" class="no-js">
<!--<![endif]-->
<head>
    {{ HTML::style( asset('css/bootstrap.css') ) }}
    {{ HTML::style( asset('css/common.css') ) }}
    {{ HTML::script('js/jquery.js'); }}
    {{ HTML::script('js/script.js'); }}
    {{ HTML::script('js/bootstrap.js'); }}
    {{ HTML::script('js/lodash.js'); }}
    {{ HTML::script('js/jquery.dateFormat.min.js'); }}
    <title>SEPAL - Downloads</title>
    <style type="text/css">
        html {
            overflow-x: hidden;
            overflow-y: auto;
        }

        .scenes .panel-heading {
            padding: 3px 5px
        }

        .scenes .panel-body {
            padding: 4px
        }

        .scenes .glyphicon{
            top:2px;
            font-size:20px;
        }

        .pointer:hover{
            cursor:pointer;
        }


    </style>
    <script type="text/javascript" src="https://cdnjs.cloudflare.com/ajax/libs/jquery-dateFormat/1.0/jquery.dateFormat.min.js"></script>
    <script type="text/javascript">
        $(document).ready(function () {

            var template = _.template(
                $("script.template").html()
            );
            var sceneContainer = $('.scenes')

            checkSession();
            setInterval(checkSession, 5000);

            function checkSession() {
                $.get("https://{{SdmsConfig::value('host')}}/downloadstatus")
                    .done(function (data) {
                        var requests = $.parseJSON(data);

                        sceneContainer.html('');
                        var requestIndex = 0
                        _.each(requests, function (request) {
                            var html = ''
                            var requestTitle = $.format.date(request.requestTime,'dd/MM/yyyy HH:mm')  + ' UTC';
                            var removeStatus = getRemoveRequestButtonStatus(request);
                            if (request.groupScenes){
                                requestTitle = (request.requestName != null ? request.requestName : request.requestId) + " || " + requestTitle;
                                removeStatus = getRemoveGroupedRequestButtonStatus(request)
                            }


                            html = '<div class="panel panel-primary"><div class="panel-heading"><h5 class="panel-title"><span style="' + removeStatus+'" onclick="javascript:removeFromDashboard(' + request.requestId + ',\'\')" title="Remove Request" class=" pointer glyphicon glyphicon-trash"></span> &nbsp;&nbsp;' + requestTitle + '</h5></div>'
                            html = html + '<div id="panel' + requestIndex +'" class="panel-collapse collapse in"><div class="panel-body">'
                            var i = 0;
                            _.each (request.scenes, function (scene) {
                                scene.i = i;
                                scene.icon = icon(scene);
                                scene.message = message(scene);
                                scene.buttonStyle = getRemoveSceneButtonStatus(scene)
                                html = html + template(scene)
                                i++;
                            });


                            sceneContainer.append(html + "</div></div></div>")

                            requestIndex++
                        })
                    })
            }

            function requestIcon(request){
                return pickUpIcon(request.status)
            }

            function pickUpIcon(status){
                switch (status) {
                    case 'FAILED':
                        return '../images/error.png';
                    case 'PUBLISHED':
                        return '../images/tick.png';
                    default:
                        return '../images/ajax-loader-1.gif';
                }
            }

            function icon(scene) {
                return pickUpIcon(scene.status)
            }

            function getRemoveButtonStatus(status){
                var style="display:none";
                switch (status) {
                    case 'PUBLISHED':
                    case 'FAILED':
                        style=""
                        break;
                }
                return style;
            }

            function getRemoveSceneButtonStatus(scene){
                return getRemoveButtonStatus(scene.status)
            }

            function getRemoveGroupedRequestButtonStatus(request){
                return getRemoveButtonStatus(request.status)
            }

            function getRemoveRequestButtonStatus(request){
                var style="";
                for (index = 0; index < request.scenes.length; index++){
                    var scene = request.scenes[index];
                    style = getRemoveSceneButtonStatus(scene.status);
                    if (style != ""){
                        break;
                    }
                }
                return style;
            }

            function pickMessage(status){
                switch (status) {
                    case 'REQUESTED':
                    case 'STARTED':
                        return 'Pending...';
                    case 'DOWNLOADING':
                        return 'Downloading...';
                    case 'DOWNLOADED':
                        return 'Download Completed...';
                    case 'TRANSFORMING':
                        return 'Working on data...';
                    case 'TRANSFORMED':
                        return 'Data transformed...';
                    case 'PROCESSING':
                        return 'Processing image...';
                    case 'PROCESSING':
                        return 'Process phase completed...';
                    case 'PUBLISHING':
                        return 'Publishing';
                    case 'PUBLISHED':
                        return 'Completed';
                    default:
                        return 'Failed to download';
                }
            }

            function message(scene) {
                return pickMessage(scene.status)
            }

            function requestMessage(request){
                return pickMessage(request.status)
            }
        })

        function removeFromDashboard(requestId, sceneId){
             var url = "https://{{SdmsConfig::value('host')}}/removeFromDashboard?requestId=" + requestId + "&sceneId=" + sceneId
             $.get(url).done (function (data){
                window.location.reload();
             });
         }

    </script>
</head>
<body>


<div class="popup-container" style="margin:25px;">
    <div class="panel-group scenes" id="accordion">

    </div>
    <div class="clearboth"></div>
    <br/>
    <span>Obtaining the requested scenes from the USGS archive. Depending on the number and type of scenes requested, this may take some time. All available images will be transferred to your working directory once the download is complete.</span>
</div>

<script type="text/template" class="template">
    <ol class="img-up-section">
        <li data="<%=id%>" datasetId="<%=sceneReference.dataSet%>">
                <p><%=sceneReference.id%></p>

                <div class="info-img">
                    <span><img src="../images/info.png"></span>

                    <div class="arrow_box_info">
                        <%=message%>
                    </div>
                </div>
                <span style="<%=buttonStyle%>" title="Remove Scene" onclick="javascript:removeFromDashboard(<%=request.requestId%>,<%=id%>)" class="pointer glyphicon glyphicon-trash"></span>
                <span class="action">
                <img class="<%=id%>" src="<%=icon%>">
                </span>
            </li>
    </ol>

</script>

</body>
</html>