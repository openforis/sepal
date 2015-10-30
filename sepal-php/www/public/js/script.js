var selectedGroup = "";
//Jquery initialization on page load

var openMigrationStatus = function () {

    var migrationURL = 'migrationstatus';
    var migrationWindow = window.open('', 'Migration Status', 'toolbar=no, location=no, directories=no, status=no, menubar=no, scrollbars=yes, resizable=no, copyhistory=no,height=300,width=350,fullscreen=no');

    if (!migrationWindow) {
        alert("A popup blocker was detected. Please Remove popup blocker for this site and try again!");
        return false;
    }

    if (migrationWindow.location.href == 'about:blank') {

        $('.sceneName:checked').each(function () {
            $(this).parent('.parentScreens').removeClass('select');
            $(this).prop('checked', false);
            $("#selectAll").attr("value", "Select All");
        });


        migrationWindow.location = migrationURL;
    } else {
        // #todo else do nothing
    }
    migrationWindow.focus();

}

$(document).ready(function () {

    $("#clearlatLong").click(function () {
        $('#lat1').val("");
        $('#long1').val("");
        $('#lat2').val("");
        $('#long2').val("");

        $("input[type='hidden'][name='topLeftLatitude']").val("");
        $("input[type='hidden'][name='topLeftLongitude']").val("");
        $("input[type='hidden'][name='bottomRightLatitude']").val("");
        $("input[type='hidden'][name='bottomRightLongitude']").val("");

        return false;
    });

    $(".web-accordion-toggle").click(function () {
        var $webAccordionToggle = $('.web-accordion-toggle');
        var webAccordionContent = $('.web-accordion-content');
        if ($(this).attr("area") == 'path') {

            $webAccordionToggle.eq(0).addClass("open");
            $webAccordionToggle.eq(1).removeClass("open");
            webAccordionContent.eq(0).slideDown();
            webAccordionContent.eq(1).slideUp();

            $('#identifier').val("1");


        } else if ($(this).attr("area") == 'lat') {

            $webAccordionToggle.eq(1).addClass("open");
            $webAccordionToggle.eq(0).removeClass("open");
            webAccordionContent.eq(0).slideUp();
            webAccordionContent.eq(1).slideDown();

            $('#identifier').val("2");
        }
    });


    var activeFolder = "";

    $(document).on("click", ".folderPath", function () {

        $(this).parent("article").addClass("select");

        var randClass = Math.random().toString(36).substr(2);
        $(this).parent("article").addClass(randClass);

        $("#fileFolder").html('<img align="middle" class="ajax-loader" src="images/ajax-loader.gif"/>');
        var folderPath = $(this).attr("path");

        activeFolder = folderPath;
        var appendDiv = $(this).parent().parent().find(".subfolder");
        var wholePathArray = folderPath.split("/");
        var parentliclass = $(this).parent().parent().attr("class");

        //update folder breadcrumb
        var breadCrumbHtml = "";
        for (var i = 0; i < wholePathArray.length; i++) {
            if (wholePathArray[i].length > 0) {
                breadCrumbHtml += '<li><span class="pull-left sprite right-arrow"></span>' + wholePathArray[i] + '</li>';
            }
        }
        $(".folderbreadcrumb").html(breadCrumbHtml);

        //update left subfolder directory structure
        $.post("showfolder", {folderPath: folderPath})
            .done(function (data) {
                if (data != 0) {

                    $("#fileFolder").html(data);
                }
            });
        $.post("subfolder", {folderPath: folderPath})
            .done(function (datas) {
                if (datas == '') {

                    $("." + randClass).removeClass("select");
                } else if (datas != 0) {

                    appendDiv.html(datas);
                    if (parentliclass == 'folderclose') {
                        $("." + parentliclass).removeClass('folderclose').addClass('folderopen');
                    }
                }
            });
    });
    //back arrow function
    $(document).on("click", ".arrow-back", function () {
        var wholePathArray = activeFolder.split("/");
        wholePathArray.splice(-1, 1);
        var previousPath = wholePathArray.join("/");
        activeFolder = previousPath;


        //update folder breadcrumb
        var breadCrumbHtml = "";
        for (var i = 0; i < wholePathArray.length; i++) {
            if (wholePathArray[i].length > 0) {
                breadCrumbHtml += '<li><span class="pull-left sprite right-arrow"></span>' + wholePathArray[i] + '</li>';
            }
        }
        $(".folderbreadcrumb").html(breadCrumbHtml);


        $.post("showfolder", {folderPath: previousPath})
            .done(function (data) {
                if (data != 0) {
                    $("#fileFolder").html(data);
                }
            });
    });


//function to handle the left pane arrow in dashboard
    $(document).on("click", ".subarrow", function () {
        var tempFlag = 0;
        var randClass = Math.random().toString(36).substr(2);
        var folderPath = $(this).next().next().attr("path");
        var appendDiv = $(this).parent().parent().find(".subfolder");
        var parentliclass = $(this).parent().parent().attr("class");
        var cssClassHandler = $(this).parent("article").find(".right-arrow");
        $(this).parent("article").addClass(randClass);
        var currentStatus = $(this).parent("article").attr("class");
        currentStatus = currentStatus.split(" ");

        //flagsetting to identify open or not
        for (var inc = 0; inc < currentStatus.length; inc++) {
            if (currentStatus[inc] == 'select') {
                tempFlag = 1;
            }
        }
        //status check using flag
        if (tempFlag == 1) {
            //portion to handle close arrow
            $(this).parent("article").removeClass("select");
            appendDiv.html(" ");

        } else {
            //portion to handle open arrow and an ajax to get the data
            $(this).parent("article").addClass("select");
            $.post("subfolder", {folderPath: folderPath})
                .done(function (datas) {
                    if (datas == '') {
                        cssClassHandler.addClass("no-arrow");
                        $("." + randClass).removeClass("select");
                    } else if (datas != 0) {
                        appendDiv.html(datas);
                        if (parentliclass == 'folderclose') {
                            $("." + parentliclass).removeClass('folderclose').addClass('folderopen');
                        }
                    }
                });
        }
    });

//jquery function to disable group

    $(document).on("click", ".blockgroup", function () {
        var groupName = $(this).attr("data");
        selectedGroup = $(this).attr("eq");
        $.post("disablegroup", {groupName: groupName})
            .done(function () {
                var $group = $("span[eq='" + selectedGroup + "']");
                $group.parent().prev().html("Disabled");
                $group.removeClass("blockgroup").addClass("enableGroup").html("Enable");
            });

    });
//jquery function to disable group

    $(document).on("click", ".zipFolder", function () {
        var currentLink = $(this).attr("link");


        $("body").append("<div class='popup-wrap'><div class='popup-container'><img src='images/search-loader.gif' width='128' height='15'><div class='clearboth'></div><span>Preparing to download the requested folder. Depending on the folder size, this may take some time. Don't refresh the page until complete.</span></div></div>");


        $.post("compressfolder", {currentLink: currentLink})
            .done(function () {
                window.open("downloadtar/" + currentLink); // TODO: Make configurable
                $(".popup-wrap").delay(1000).fadeOut(1000);

            }).fail(function () {

                alert("failed on compression, please try again");

            });

    });
//jquery function to enable group

    $(document).on("click", ".enableGroup", function () {
        var groupName = $(this).attr("data");
        selectedGroup = $(this).attr("eq");
        $.post("enablegroup", {groupName: groupName})
            .done(function () {
                var $group = $("span[eq='" + selectedGroup + "']");
                $group.parent().prev().html("Enabled");
                $group.removeClass("enableGroup").addClass("blockgroup").html("Disable");
            });

    });

//jquery function to get the images based on priorities::search result
    var imageFlag = 0;
    $('.screengrid li').each(function () {

        var $this = $(this);
        var imageName = $this.find(".imageName").html();
        var imageUrl = $this.find(".imageUrl").html();


        $.post("imagerepo", {
            imageName: imageName,
            imageUrl: imageUrl,
            imageFlag: imageFlag,
            datasetId: $this.data('datasetId')
        })
            .done(function (data) {
                var resArray = $.parseJSON(data);
                $.each(resArray, function () {
                    var thumb = this['thumb'];
                    var highresol = this['highresol'];
                    imageFlag = this['imageFlag'];

                    var $item = $(".screengrid li");
                    $item.eq(imageFlag).find(".sdmsRepoHigh").attr("href", highresol);
                    $item.eq(imageFlag).find(".sdmsRepo").attr("src", thumb);
                    $item.eq(imageFlag).find(".sdmsRepo").attr("style", "");
                    $item.eq(imageFlag).find(".sdmsRepo").delay(2000);

                });
                /* var resArray = data.split("-");


                 */
            });
        imageFlag++;
    });
    $(document).on("click", ".sceneName", function () {
        //getting all data based on name
        var incomplete = $(this).prop('checked');
        if (incomplete) {
            $(this).parent('.parentScreens').addClass('select');
        } else {
            $(this).parent('.parentScreens').removeClass('select');
        }
    });

    $(document).on("click", ".thumbdirectory", function () {
        var $popup = $(".popup");
        $popup.remove();
        var imageSrc = $(this).attr("src");
        $("body").append('<div class="popup bigimage" style="float: left; background-color: rgba(0,0,0,.50); display:none; height: auto; z-index: 1094; position: absolute; top: 0; width: 100%;"><div style="width:70%;"><div class="closepopup">Close Me</div><img class="thumbdirectory" src=' + imageSrc + '></div></div>');
        $popup.fadeIn("slow");
    });
    $(document).on("click", ".closepopup", function () {
        $(".popup").fadeOut("slow");
    });
    $(document).on("click", ".argonbox a", function () {
        if ($(this).attr("class") != 'downloadData') {
            $(this).argonBox({
                "duration": "fast"
            });
            return false; // Prevent the default behavior of the HTML link.
        }
    });


//onclick function to handle select scenes from search result
    $(document).on("click", "#requestScenes", function () {
        var processingScript = $('#processingScript').val();

        //get all scene names from search result page
        var $selectedSceneNames = $('.sceneName:checked');
        var requestScenes = $selectedSceneNames.map(function () {
            return this.value;
        }).get();
        if (requestScenes.length > 0) {

            //loader trigger then ajax process
            var sceneName = '';
            sceneName = ",";

            $selectedSceneNames.each(function () {
                sceneName = sceneName + $(this).val() + ",";
            });

            $.post("migrate", {requestScene: sceneName, processingScript: processingScript})
                .done(function () {
                    openMigrationStatus();
                }).fail(function () {

                });
        } else {

            //error message
        }
    });


//search page sort
    $(".sortby").change(function () {

        var sortby = $("#sortby").val();
        var url = window.location.href;
        if (url.indexOf('?') > -1) {
            url += '&sortby=' + sortby
        } else {
            url += '?sortby=' + sortby
        }
        if (sortby.length > 2) {
            window.location.href = url;
        }

    });


//terminal animation for minimize and maximize
    $(document).on("click", ".window-btn", function () {
        var terminalContainer = $(".terminal-wrap");
        var breadcrumb = $(".breadcrumb");
        var textContainer = $(".container>p");

        var txtHeight = textContainer.height();
        var txtHeightTP = textContainer.css("margin-top");
        var txtHeightBT = textContainer.css("margin-bottom");

        var bdcrumbHeight = breadcrumb.height();
        var bdcrumbMargBT = breadcrumb.css("margin-bottom");
        var bdcrumbPadTp = breadcrumb.css("padding-top");
        var bdcrumbPadBT = breadcrumb.css("padding-bottom");

        var totalHeight = parseInt(txtHeight) + parseInt(txtHeightTP) + parseInt(txtHeightBT) + parseInt(bdcrumbHeight) + parseInt(bdcrumbMargBT) + parseInt(bdcrumbPadTp) + parseInt(bdcrumbPadBT);

        if (terminalContainer.hasClass("minimize")) {
            terminalContainer.removeClass('minimize');
            $("iframe").attr("height", "400px");
            terminalContainer.removeAttr("style")
        } else {
            terminalContainer.addClass('minimize');
            $("iframe").attr("height", "800px");
            terminalContainer.animate({marginTop: -totalHeight}, 1000);

        }
    });
});
//remove user from group
$(document).on("click", ".removeGroup", function (e) {
    e.preventDefault();
    var group_id = $(this).attr("id");
    var user_id = $(this).attr("rel");
    $.post("removegroup", {groupId: group_id, userId: user_id})
        .done(function (data) {
            var resArray = data.split("-");
            if (resArray[0] == 'true') {//hide the group name against user
                $(".ugroup_" + group_id + "_" + user_id).hide();
            }
            if (resArray[1] == 'false') {//hide edit delete option if logged in user has no further access
                $("td#user_" + user_id).hide();
            }
        });

});
$(document).on("change", "#role", function () {
    var role = $(this).val();
    if (role >= 1) {
        $("#group").parent().hide();
        $(".grp_admin_area").parent().hide();
    } else {
        $("#group").parent().show();
        $(".grp_admin_area").parent().show();
    }
});
