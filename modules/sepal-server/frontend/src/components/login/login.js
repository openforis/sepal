/**
 *
 * Login module
 *
 * @author Mino Togna
 */
require( '../velocity/velocity' )
require( '../velocity/velocity-ui' )
require( '../kenburnsy/kenburnsy' )
require( '../kenburnsy/kenburnsy.css' )
require( '../parallax/parallax' )
require( '../login/login.scss' )


var EventBus  = require( '../event/event-bus' );
var Events    = require( '../event/events' );
var Animation = require( '../animation/animation' )

var template = require( './login.html' )
var html     = $( template( {} ) )

var bg01 = require( './bg-01.jpg' )
var bg02 = require( './bg-02.jpg' )

var showLogin = function () {

    $( "body" ).find( '.app' ).append( html )

    // init form
    var form       = html.find( 'form' )
    var formNotify = form.find( '.form-notify' )

    form.submit( function ( e ) {
        e.preventDefault()

        var params = {

            url         : form.attr( 'action' )
            , method    : form.attr( 'method' )
            , data      : form.serialize()
            , error     : null
            , beforeSend: function () {
                formNotify.html( '' ).hide()
                form.find( '.form-group' ).removeClass( 'error' )
            }
            , complete  : function ( object, status ) {

                switch ( status ) {
                    case 'error' :

                        formNotify.html( 'Invalid username or password' ).css( 'opacity', '0' ).show().addClass( 'animated' ).addClass( 'fadeInUp' );
                        setTimeout( function () {
                            formNotify.css( 'opacity', '1' )
                        }, 100 )

                        form.find( '.form-group' ).addClass( 'error' )

                        break;

                    case 'success' :

                        var user = object.responseJSON

                        // html.fadeOut( function () {
                        //     html.remove()
                        // } )
                        EventBus.dispatch( Events.APP.USER_LOGGED_IN, this, user )

                        break;
                }
            }

        }

        EventBus.dispatch( Events.AJAX.REQUEST, this, params )
    } )


    var $login = $( "#login" );
    Animation.animateIn( $login, function () {
        $login.find( '.container' ).addClass( 'login-container' )
        //TODO
        $login.find( 'input[name=user]' ).focusin()
    } )

    setTimeout( function () {
        // start bg slideshow
        siteBgSlideshow()
        siteBgStar()

    }, 100 )

}

var hideLogin = function () {
    // html.fadeOut( function () {
    html.remove()
    // } )
}

var siteBgSlideshow = function siteBgSlideshow() {
    var bgImg = $( '.site-bg-img' )

    var img = $( '<img src="' + bg01 + '"/>' )
    bgImg.append( img )

    img = $( '<img src="' + bg02 + '"/>' )
    bgImg.append( img )

    bgImg.kenburnsy( {
        fullscreen    : true,
        duration      : 5000,
        fadeInDuration: 1500
    } )
}

var star_color = 'rgba(255, 255, 255, .5)';// rgba format - star color
var star_width = 1.5; // px - star width
var siteBgStar = function () {
    var $body   = $( 'body' )
    var $canvas = $( '.site-bg-canvas' );

    $body.addClass( 'is-site-bg-star' );

    function callCanvas( canvas ) {
        var screenpointSplitt = 12000
        var movingSpeed       = 0.2
        var viewportWidth     = $( window ).width();
        var viewportHeight    = $( window ).height();
        var nbCalculated      = Math.round( viewportHeight * viewportWidth / screenpointSplitt );

        var $this    = $( this ),
            ctx      = canvas.getContext( '2d' );
        $this.config = {
            star    : {
                color: star_color,
                width: star_width
            },
            line    : {
                color: star_color,
                width: 0.4
            },
            position: {
                x: canvas.width * 0.5,
                y: canvas.height * 0.5
            },
            velocity: movingSpeed,
            length  : nbCalculated,
            distance: 130,
            radius  : 120,
            stars   : []
        };

        function Star() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;

            this.vx = ($this.config.velocity - (Math.random() * 0.3));
            this.vy = ($this.config.velocity - (Math.random() * 0.3));

            this.radius = Math.random() * $this.config.star.width;
        }

        Star.prototype    = {
            create: function () {
                ctx.beginPath();
                ctx.arc( this.x, this.y, this.radius, 0, Math.PI * 2, false );
                ctx.fill();
            },

            animate: function () {
                var i;
                for ( i = 0; i < $this.config.length; i++ ) {

                    var star = $this.config.stars[ i ];

                    if ( star.y < 0 || star.y > canvas.height ) {
                        star.vx = star.vx;
                        star.vy = -star.vy;
                    }
                    else if ( star.x < 0 || star.x > canvas.width ) {
                        star.vx = -star.vx;
                        star.vy = star.vy;
                    }
                    star.x += star.vx;
                    star.y += star.vy;
                }
            },

            line: function () {
                var length = $this.config.length,
                    iStar,
                    jStar,
                    i,
                    j;

                for ( i = 0; i < length; i++ ) {
                    for ( j = 0; j < length; j++ ) {
                        iStar = $this.config.stars[ i ];
                        jStar = $this.config.stars[ j ];

                        if (
                            (iStar.x - jStar.x) < $this.config.distance &&
                            (iStar.y - jStar.y) < $this.config.distance &&
                            (iStar.x - jStar.x) > -$this.config.distance &&
                            (iStar.y - jStar.y) > -$this.config.distance
                        ) {
                            if (
                                (iStar.x - $this.config.position.x) < $this.config.radius &&
                                (iStar.y - $this.config.position.y) < $this.config.radius &&
                                (iStar.x - $this.config.position.x) > -$this.config.radius &&
                                (iStar.y - $this.config.position.y) > -$this.config.radius
                            ) {
                                ctx.beginPath();
                                ctx.moveTo( iStar.x, iStar.y );
                                ctx.lineTo( jStar.x, jStar.y );
                                ctx.stroke();
                                ctx.closePath();
                            }

                        }
                    }
                }
            }

        };
        $this.createStars = function () {
            var length = $this.config.length,
                star,
                i;

            ctx.clearRect( 0, 0, canvas.width, canvas.height );
            for ( i = 0; i < length; i++ ) {
                $this.config.stars.push( new Star() );
                star = $this.config.stars[ i ];
                star.create();
            }

            star.line();
            star.animate();
        };

        $this.setCanvas = function () {
            canvas.width  = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        $this.setContext = function () {
            ctx.fillStyle   = $this.config.star.color;
            ctx.strokeStyle = $this.config.line.color;
            ctx.lineWidth   = $this.config.line.width;
            ctx.fill();
        };

        $this.loop = function ( callback ) {
            callback();
            reqAnimFrame( function () {
                $this.loop( function () {
                    callback();
                } );
            } );
        };

        $this.bind = function () {
            $( window ).on( 'mousemove', function ( e ) {
                $this.config.position.x = e.pageX;
                $this.config.position.y = e.pageY;
            } );
        };

        $this.init = function () {
            $this.setCanvas();
            $this.setContext();

            $this.loop( function () {
                $this.createStars();
            } );

            $this.bind();
        };

        return $this;
    }

    var reqAnimFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame || function ( callback ) {
            window.setTimeout( callback, 1000 / 60 );
        };

    callCanvas( $( 'canvas' )[ 0 ] ).init();
    $canvas.velocity( 'transition.fadeIn', {
        duration: 3000
    } );

    var waitForFinalEvent = (function () {
        var timers = {};
        return function ( callback, ms, uniqueId ) {
            if ( !uniqueId ) {
                uniqueId = '';
            }
            if ( timers[ uniqueId ] ) {
                clearTimeout( timers[ uniqueId ] );
            }
            timers[ uniqueId ] = setTimeout( callback, ms );
        };
    })();

    $( window ).resize( function () {
        waitForFinalEvent( function () {
            callCanvas( $( 'canvas' )[ 0 ] ).init();
        }, 800, '' );
    } );
    $( '.site-bg' ).parallax()
}


// showLogin()

EventBus.addEventListener( Events.LOGIN.SHOW, showLogin, this )
EventBus.addEventListener( Events.LOGIN.HIDE, hideLogin, this )


