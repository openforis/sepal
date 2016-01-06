/**
 * ArgonBox - jQuery lightbox plugin
 * Björn Hansson - 2013
 * License: http://licence.visualidiot.com/
 */
(function($) {
    "use strict";

    $.fn.argonBox = function(options) {
        options = $.extend({}, $.fn.argonBox.defaults, options);
        
        return this.each(function() {
            var windowHeigth = window.innerHeight || $(window).height(), // Make it work on iPad & Android
                windowWidth  = window.innerWidth  || $(window).width(),
                allLinks = $('.argonbox a'),
                currentPos,
                prev,
                next,
                
                methods = {
                    init : function() {
                        $('body').css('overflow-y', 'hidden'); // Hide scrollbars
                
                        // Display the overlay
                        $('<div id="overlay"></div>')
                        .css('opacity', '0')
                        .animate({'opacity' : options.opacity}, options.duration)
                        .appendTo('body');

                        // Create the lightbox container
                        $('<div id="lightbox"></div>')
                        .hide()
                        .appendTo('body');

                        // Create the description container
                        $('<div id="description"><strong></strong></div>').appendTo('#lightbox');
                        
                        if(allLinks.length > 1) {
                            // Create the navigation container
                            if(options.bootstrap) { // If you want to use buttons from Bootstrap. (Bootstrap must of course be included in your site)
                                $('<div id="navigation"><a href="#" id="previous" class="btn btn-small"><span class="glyphicon glyphicon-chevron-left"></span></a> <a href="#" id="next" class="btn btn-small"><span class="glyphicon glyphicon-chevron-right"></span></a></div>')
                                .appendTo('#description');
                            }
                            else { // else use the standard buttons: www.glyphicons.com - http://creativecommons.org/licenses/by/3.0/
                                $('<div id="navigation"><a href="#" id="previous" class="previousBtn">&nbsp;</a> <a href="#" id="next" class="nextBtn">&nbsp;</a></div>')
                                .appendTo('#description');
                            }
                        }
                    },
                    show : function( ) {
                        $('#lightbox').hide();

                        // Display the image on load
                        $('<img>')
                        .attr('src', $('a.current').attr('href'))
                        .css({
                            'max-height': windowHeigth-50, // -50, so that the description is visible.
                            'max-width':  windowWidth-50
                        })
                        .load(function() {
                            $('#lightbox')
                            .css({
                                'top':  (windowHeigth - $('#lightbox').height()) / 2,
                                'left': (windowWidth  - $('#lightbox').width())  / 2
                            })
                            .show();
                        })
                        .prependTo('#lightbox');
                        
                        // Create the description container
                        $('#description strong').text($('a.current').attr('title'));                    
                    },
                    close : function( ) {
                        $('#overlay, #lightbox').remove();
                        $('body').css('overflow-y', 'auto'); // Show scrollbars again
                        $('a').removeClass('current');
                    }
                };
            // End of var declaration.

            // Set current link
            $(this).addClass('current');
            methods.init();
            methods.show();
            
            // Previous link click
            $('#previous').click(function() {
                currentPos = allLinks.index($('a.current'));
                prev = allLinks.get(currentPos-1); // Find previous from current

                $('a').removeClass('current');
                $(prev).addClass('current');

                $('#lightbox img').remove();
                methods.show();

                return false;
            });
            
            // Next link click
            $('#next').click(function() {
                currentPos = allLinks.index($('a.current'));
                next = allLinks.get(currentPos + 1); // Find previous from current
                
                if(!next) {
                    next = allLinks.get(0);
                }

                $('a').removeClass('current');
                $(next).addClass('current');

                $('#lightbox img').remove();
                methods.show();

                return false;
            });
      
            // Remove it all on click
            $('#overlay').click(function() {
                methods.close();
            });
        });
    };

    $.fn.argonBox.defaults = {
        'duration': 'fast',
        'opacity': '0.9',
        'bootstrap': false,
        'navigation': true,
    };
}) (jQuery);