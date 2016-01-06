/*
* Title:  inventory_metadata 0.6.0
* Dependencies:  jQuery 1.3.2 + (jquery.js)
*      jQueryUI 1.7+ (jquery.ui/ui/.js)
*      jquery.validate 1.5+ (jquery.validate/jquery.validate.js)
*      jquery.util.toDecimalDeg.js
*      jquery.ui/themes/base/ui.all.css
*      jquery.ui/ui/ui.core.js
*      jquery.ui/ui/ui.datepicker.js
*      jquery.ui/ui/ui.draggable.js
*      jquery.ui/ui/ui.resizable.js
*      jquery.ui/ui/ui.dialog.js
* Author:  Jo Wahle and Danielle Ames
* CAUTION:
*      This script uses LANDSAT ETM for test purposes, launched April 15, 1999
#      FIX sensorName AND launchDate AND launchDateString BEFORE LAUNCH
*
* 2/23/2009
*/

// Landsat doesn't really go all the way to the poles - limit the latitude:
var latBounds = [-82.6401, 82.6401];
// Global pathMax for MSS1
var pathMax = 233; 
// helper function that gets the active Accordion element for AOI selection
// and compares against a regular expression
// expr is a regular expression to test for
(function($) {
$.aoi_select_match = function(expr, options) {
    var aoiEntryHeader = $("#accordion").data("selectedAccordionId");
    return expr.test(aoiEntryHeader);
}
})(jQuery);

// Custom selectors
/*(function($) {
$.extend($.expr[":"], {
	// http://docs.jquery.com/Plugins/Validation/filled
	filled: function(a) {return !!$.trim(a.value);}

});
		  })(jQuery);*/

// helper function to populate the query string from (validated) form elements
(function($) {
$.inventory_metadata_query_string = function(options) {
	//show helpful hint (Please be Patient)
	$(".get_metadata_alert").show();
	var sensorName = new String($("#sensor").val()); // TODO: fix this before launch
    var queryString = "sensor_name=" + sensorName;
	

    var startDate = new String($("#start_date").val());
    var endDate   = new String($("#end_date").val());
    queryString += "&start_date=" + startDate + "&end_date=" + endDate;

    var cloudCoverDigits = 100;
    var cloudCover = new String($("#cloud_cover").val());
    if (cloudCover != 'All') {
        var digitsMatch = cloudCover.match(/\d+/);
        cloudCoverDigits = digitsMatch[0];
    }
    queryString += "&cloud_cover=" + cloudCoverDigits;

    var seasonal = ($("#months_only").attr("checked") ? "true" : "false");
    queryString += "&seasonal=" + seasonal;

    var aoiEntry = "lat_long";
    if ($.aoi_select_match(/path/)) {
        aoiEntry = "path_row";
    }
    if (aoiEntry == "path_row") {
        var beginPath = new String($("#begin_path").val());
        var endPath   = new String($("#end_path").val());
        if (endPath == '') { endPath = beginPath; };
        var beginRow  = new String($("#begin_row").val());
        var endRow    = new String($("#end_row").val());
        if (endRow == '') { endRow = beginRow; };

        queryString += "&aoi_entry=" + aoiEntry
            + "&begin_path=" + beginPath + "&end_path=" + endPath
            + "&begin_row=" + beginRow + "&end_row=" + endRow;
    }
    else if (aoiEntry == "lat_long") {
        var lat1 = $.toDecimalDeg($("#lat1").val(), "latitude");
        var lat2 = $.toDecimalDeg($("#lat2").val(), "latitude");
        if (lat2 == '') { lat2 = lat1; };
        var long1 = $.toDecimalDeg($("#long1").val(), "longitude");
        var long2 = $.toDecimalDeg($("#long2").val(), "longitude");
        if (long2 == '') { long2 = long1; };

        queryString += "&aoi_entry=" + aoiEntry
            + "&north_latitude=" + lat1 + "&south_latitude=" + lat2
            + "&west_longitude=" + long1 + "&east_longitude=" + long2;
    }

    var outputType = "unknown";
    var outputFormat
        = $("input:radio[name=RadioGroup_outputFormat]:checked").val();
    if (outputFormat == "custom_xml") {
        outputType = "XML";
    } else if (outputFormat == "comma_delimited") {
        outputType = "CSV";
    }
    queryString += "&output_type=" + outputType;

    return queryString;
}
})(jQuery);

// main function to validate the form and invoke get_metadata.php
(function($) {
$.fn.inventory_metadata = function(options) {
    // alert("DEBUG: Please wait, your results will be available shortly...");

    // set up a div to act as the error message dialog
    $("body").prepend("<div id='inv_meta_errmsg' name='inv_meta_errmsg' "
        + "title='Please correct the following errors'>Form Errors</div>");

    $("#inv_meta_errmsg").dialog({
        autoOpen: false,
        position: ["center", "top"],
        modal: true,
        buttons: { "Go back": function() {$(this).dialog('close');} },
        width: "50%"
    });

    // set up the minimum date and the date inputs
    // TODO: fix this before launch
    var launchDate = new Date(1972, 06, 23); // month 0-based, day of mo 1-based
    var launchDateString = "07/23/1972"; // for displaying nice error messages
	var launchDate_10 = new Date(1982,06,23);

    $("#start_date").datepicker({
        dateFormat: "mm/dd/yy", // yy is a 4-digit year (2-digit would be y)
        minDate: launchDate,
        defaultDate: launchDate_10,
        changeMonth: true,
        changeYear: true,
        showOn: 'both',
		buttonText: 'Start Date Calendar',
        buttonImage: 'includes/images/calendar.png',
        buttonImageOnly: true,
		yearRange: '1972:2020'
    });
    $("#end_date").datepicker({
        dateFormat: "mm/dd/yy",
        minDate: launchDate,
        defaultDate: new Date(), // defaults to today
        changeMonth: true,
        changeYear: true,
        showOn: 'both',
		buttonText: 'End Date Calendar',
        buttonImage: 'includes/images/calendar.png',
        buttonImageOnly: true,
		yearRange: '1972:2020'
    });

    // method: greaterThanDate
    // value:  date as string, formatted mm/dd/yyyy
    // params: Date object to compare "value" against
    //         date as string for use in the error message
    // returns true if value >= params[0]
    $.validator.addMethod("greaterThanDate",
        function(value, element, params) {
            var index1 = value.indexOf("/");
            var index2 = value.lastIndexOf("/");
            var myMonth = value.substring(0, index1);
            var myDay = value.substring(index1+1, index2);
            var myYear = value.substring(index2+1, value.length);
            var inputDate = new Date(myYear, myMonth-1, myDay);
            return inputDate.getTime() >= params[0].getTime();
        }, $.format("Please enter a date greater than {1}")
    );

    // method: formattedAsDate
    // value:  date as string which will be checked for formatting as mm/dd/yyyy
    // params: none
    // returns true if value is formatted as mm/dd/yyyy
    // algorithm taken from jQuery discussion thread
    // (TBD: could try the Datejs library at www.datejs.com instead)
    $.validator.addMethod("formattedAsDate",
        function(value, element, params) {
            var mdy = value.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
            if (!mdy) return false;
            var dt = new Date(mdy[3], mdy[1]-1, mdy[2]); // month is 0-based
            if (isNaN(dt)) return false;
            //JS allows dates like 12/99/2008; see if month or year changed
            return +mdy[1] == dt.getMonth()+1 && mdy[3] == dt.getFullYear();
        }, $.format("Please use the date format: MM/DD/YYYY")
    );

    // method:  validDegrees
    // value:   degrees as any string such as: D.dddd or D M S.sssss West
    // params:  latlong - "latitude" or "longitude"
    //          range (optional) if other than [-90.0, 90.0] or [-180.0, 180.0]
    // returns true if string evaluates to some degrees
    $.validator.addMethod("validDegrees",
        function(value, element, params) {
            // if the value is empty, return true (use the validate "required"
            // rule to deal with empty values)
            if (!value) { return true; };
			if ($.aoi_select_match(/path/) ) { return true; };
            var decimalDeg;
            try {
                if (params[1]) {
                    decimalDeg
                        = $.toDecimalDeg(value, params[0], {range: params[1]});
                }
                else {
                    decimalDeg = $.toDecimalDeg(value, params[0]);
                }
            }
            catch(e) { // TODO: before release, take the error printing out
                alert("toDecimalDeg error: " + e.name + ", " + e.message);
                return false;
            }
            // if we got back a number, return true, otherwise false
            return ((!decimalDeg || isNaN(decimalDeg)) ? false : true);
        }, $.format("Cannot determine degrees {0}")
    );
	
	//method: path_row_range
	//value: path or row as a string
	//params: range. i.e. [1,233]
	//returns true if the accordian pane is open that corresponds with lat or path
	//helper function to not always check the path/row range, even when lat/long accordian is open
	$.validator.addMethod("path_row_range",
		function(value, element, params) {
			if(!value) {return true;};
			if ($.aoi_select_match(/lat/) ) { return true; };					
			return(value >= params[0] && value <= params[1]);
		}, $.format("Cannot determine path/row range")
	);
	
	$.validator.addMethod("path_range",
		function(value, element, params) {
			if(!value) {return true;};
			if ($.aoi_select_match(/lat/) ) { return true; };
			//determine sensor for changing path for WRS-21 or WRS-2
			var sensorName = new String($("#sensor").val());
			if (sensorName == "LANDSAT_MSS1") {
				params[1] = 251;	
				pathMax = 251;
			}
			else {
				params[1] = 233;	
				pathMax = 233;
			}
			return(value >= params[0] && value <= params[1]);
		}, $.format("Cannot determine path/row range")
	);
	
	//method:metadata_digits
	//value: lat or path, 
	//paramas: /lat/ or /path/
	//returns true if the correct accordian is open and if digits is correct, 
	//false if digits incorrect, true if incorrect accordian is open
	//helper function so valdiation will not run on the unopen accordian
	$.validator.addMethod("metadata_digits",
		function(value, element, params) {
			if(!$.aoi_select_match(params[0]) ) {return true;};
			if ( this.checkable(element) && this.getLength(value, element) == 0 )
					return true;
			return(this.optional(element) || /^\d+$/.test(value));
		}, $.format("Cannot determine metadata_digts")
	);
	
	//method: additional_lat_long
	//value: lat or long as a string
	//params: lat or long
	//returns true if either lat2 or long2 is filled and if the lat/long accordian is open
	$.validator.addMethod("additional_lat_long",
		function(value,element,params) {
			
			
			
		}, $.format("Cannot determine additional lat/long")
	);
	
	//method: metadata_required
	//value: lat or path
	//params: /path/ or /lat/, #name:filled (optional)
	//returns true is the correct required data is present, false if not present
	//true if the opposite accordian menu is open
	//helper function so validation will not run on the unopen accordian
	$.validator.addMethod("metadata_required",
		function(value,element,params){
			if ( !this.depend(params, element) )
				return "dependency-mismatch";
			if(!$.aoi_select_match(params[0]) ) {return true;};
			//check to see if it should only be 1 set of values, lat/long or just one path/row
			
			//if(!(params[1])) {return true};
			//check to see if the opposite location is filled. i.e. if lat2 is passec, check to see if it is filled
			/*(if(params[1] != null)
				{	
					optional = params[1];
					alert(optional);
					if(!optional.length) {return true};
				}
			*/	
			if((params[1]) || params[1] == null) {
			switch( element.nodeName.toLowerCase() ) {
			case 'select':
				var options = $("option:selected", element);
				return options.length > 0 && ( element.type == "select-multiple" || ($.browser.msie && !(options[0].attributes['value'].specified) ? options[0].text : options[0].value).length > 0);
			case 'input':
				if ( this.checkable(element) )
					return this.getLength(value, element) > 0;
			default:
				return $.trim(value).length > 0;
			} //end switch
			}//end if(params[1]
			else
			{return true;}
		}, $.format("Metadata element is required")
	);

	/*
	// add classes to AOI inputs so we can apply a few rules across classes
    $("#begin_path,#end_path").addClass("wrs2Path");
    $("#begin_row,#end_row").addClass("wrs2Row");
	*/
    $("#lat1,#lat2").addClass("latitude");
    $("#long1,#long2").addClass("longitude");
	
	/* commented out to try to add/remove rules in consumer.html w/ accordian change
    $.validator.addClassRules({
        "wrs2Path":  { digits: true, range: [1,233] },
        "wrs2Row":   { digits: true, range: [1,248] },
        "latitude":  { validDegrees: ["latitude", latBounds] },
        "longitude": { validDegrees: ["longitude"] }
    });
	*/
    // do the work
    this.validate({
        submitHandler: function(form) {
	//GUnload();
            var queryString = $.inventory_metadata_query_string();

            // close the error message dialog in case it is still open
            $("#inv_meta_errmsg").dialog("close");

            location.href = "includes/scripts/get_metadata.php?" + queryString;

        }, // end of submitHandler function
        errorLabelContainer: "#inv_meta_errmsg", // div we added, above
        wrapper: "p",                            // each error in a <p> tag
        invalidHandler: function (form, validator) {
            $("#inv_meta_errmsg").html("Some parameters are invalid:");
            // messages will be added, in <p> tags
            $("#inv_meta_errmsg").dialog("open");
        },
        // Note: specify rules by name, reference other elements by id
        // Note: path/row and lat/long had other rules defined by addClassRules
        // Note: validate does not check form elements that are disabled
			
		rules: {
            begin_path: {metadata_required:[/path/],
						metadata_digits:[/path/],
						path_range:[1,233]
						},
            begin_row:  {metadata_required:[/path/],
						metadata_digits:[/path/],
						path_row_range:[1,248]
						},
			end_path:	{
						metadata_digits:[/path/],
						path_range: [1,233]						 
						},
			end_row:	{
						metadata_digits:[/path/],
						path_row_range:[1,248]						 
						},
            lat1:       {metadata_required: [/lat/],
						validDegrees: ["latitude", latBounds]
						},
            long1:      {metadata_required: [/lat/],
						validDegrees: ["longitude"]
						},
            lat2:       {required: function(element) 
							{	
							return (!!$.trim($("#long2").val()) && $.aoi_select_match(/lat/));
                            },
						validDegrees: ["latitude", latBounds]
						},
            long2:      {required: function(element) 
							{
							return (!!$.trim($("#lat2").val()) && $.aoi_select_match(/lat/));
                            },
						validDegrees: ["longitude"]
						},
            start_date: {
                required: true,
                greaterThanDate: [launchDate, launchDateString],
                formattedAsDate: true
            },
            end_date: {
                required: true,
                greaterThanDate: [launchDate, launchDateString],
                formattedAsDate: true
            }
        },
        messages: {
            begin_path: {
                metadata_required: "A beginning path is required",
                metadata_digits: "Please enter a number for the beginning path",
                path_range: "Beginning path must be in the range 1-233 (Range 1-251 for Landsat 1-3 MSS)"
            },
            end_path: {
				required: "An ending path is required",
                metadata_digits: "Please enter a number for the ending path",
                path_range: "Ending path must be in the range 1-233 (Range 1-251 for Landsat 1-3 MSS)"
            },
            begin_row: {
                metadata_required: "A beginning row is required",
                metadata_digits: "Please enter a number for the beginning row",
                path_row_range: "Beginning row must be in the range 1-248"
            },
            end_row: {
				required: "An ending row is required",
                metadata_digits: "Please enter a number for the ending row",
                path_row_range: "Ending row must be in the range 1-248"
            }, 
            lat1: {
                metadata_required: "Latitude is required",
                validDegrees: "Latitude must be in decimal degrees "
                    + "or degrees minutes seconds between "
                    + latBounds[0] + " and " + latBounds[1]
            },
            long1: {
                metadata_required: "Longitude is required",
                validDegrees: "Longitude must be in decimal degrees "
                    + "or degrees minutes seconds between -180.0 and 180.0"
            },
            lat2: {
                required: "Second Latitude is required",
                validDegrees: "Latitude must be in decimal degrees "
                    + "or degrees minutes seconds between "
                    + latBounds[0] + " and " + latBounds[1]
            },
            long2: {
                required: "Second Longitude is required",
                validDegrees: "Longitude must be in decimal degrees "
                    + "or degrees minutes seconds between -180.0 and 180.0"
            },
            start_date: {
                required: "A starting date is required",
                date: "Starting date must be a date such as MM/DD/YYYY",
                formattedAsDate: "Starting date must be formatted MM/DD/YYYY",
                greaterThanDate: "Starting date must be at least "
                                + launchDateString
            },
            end_date: {
                required: "An ending date is required",
                date: "Ending date must be a date such as MM/DD/YYYY",
                formattedAsDate: "Ending date must be formatted MM/DD/YYYY",
                greaterThanDate: "Ending date must be at least "
                                + launchDateString
            }
        } //end messages

	
    }); // end of validate
	

	


    return this;
};  // end of inventory_metadata fn
})(jQuery);

