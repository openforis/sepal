;(function ( $, window, document, undefined ) {
  const pluginName = 'kenburnsy',
    defaults = {
      fullscreen: false,
      duration: 9000,
      fadeInDuration: 1500,
      height: null
    };

  const _transitions = {
    zoomOut: function (slide, duration) {
      $(slide)
        .velocity({
          rotateZ: '3deg',
          scale: '1.1'
        }, 0)
        .velocity({
          translateZ: 0,
          rotateZ: '0deg',
          scale: '1'
        }, duration);
    },
    zoomIn: function (slide, duration) {
      $(slide)
        .velocity({
          rotateZ: '0deg',
          scale: '1'
        }, 0)
        .velocity({
          translateZ: 0,
          rotateZ: '3deg',
          scale: '1.1'
        }, duration);
    }
  };

  /**
   *
   * $preloadImage() utility function.
   * @param <String> url
   * @return <jQuery.Deferred> promise instance
   *
   */
  const $preloadImage = function (url) {
    const loader = function (deferred) {
      const image = new Image();

      image.onload = loaded;
      image.onerror = errored;
      image.onabort = errored;

      image.src = url;

      function loaded() {
        unbindEvents();
        // HACK for Webkit: 'load' event fires before props are set
        setTimeout(function () {
          deferred.resolve(image);
        });
      }

      function errored() {
        unbindEvents();
        deferred.rejectWith(image);
      }

      function unbindEvents() {
        image.onload = null;
        image.onerror = null;
        image.onabort = null;
      }
    };

    return $.Deferred(loader).promise();
  };
  /**
     *
     * Object.keys polyfill
     *
     */
    if (!Object.keys) {
        Object.keys = function(o) {
            if (o !== Object(o)) {
                throw new TypeError('Object.keys called on a non-object');
            }
          const k = [];
          let p;
          for (p in o) {
                if (Object.prototype.hasOwnProperty.call(o,p)) {
                    k.push(p);
                }
            }
            return k;
        };
    }

    function Plugin (element, options) {
        this.el = element;
        this.$el = $(element);
        this.settings = $.extend({}, defaults, options);
        this._defaults = defaults;
        this._name = pluginName;
        this._slides = [];
        this.currentIndex = 0;
        this.init();
    }

    $.extend(Plugin.prototype, {

        init: function () {
          const settings = this.settings,
            _this = this;
          let urls;

          urls = this.$el.children().map(function (index, imageElement) { return imageElement.src; });

            this.$el.addClass(function () {
              const classes = [pluginName];

              if (settings.fullscreen) { classes.push('fullscreen'); }

                return classes.join(' ');
            });

            $.when.apply($, $.map(urls, $preloadImage)).done(function() {
              const images = Array.prototype.slice.call(arguments);
              _this.buildScene(images);
            });
        },

        /**
         *
         * reveal() moves hidden slide at given index to the last(visible) position in the DOM tree
         * and fades it in.
         * @param <Number> index
         *
         */
        reveal: function (index) {
          const slide = this._slides[index],
            $el = this.$el;

          $(slide).velocity({ opacity: 0 }, 0, function () {
                $(this).appendTo($el);
            }).velocity({ opacity: 1, translateZ: 0 }, { duration: this.settings.fadeInDuration, queue: false });
        },

        /**
         *
         * animate() starts random transition for slide at given index
         * @param <Number> index
         *
         */
        animate: function (index) {
          const keys = Object.keys(_transitions),
            transition = _transitions[keys[Math.floor(keys.length * Math.random())]],
            duration = this.settings.duration,
            slide = this._slides[index];

          transition(slide, duration);
        },

        /**
         *
         * show() reveals and animates slide at given index
         * @param <Number> index
         *
         */
        show: function (index) {
            this.reveal(index);
            this.animate(index);
        },

        /**
         *
         * next() switches to the next slide.
         * Index cycles from top to bottom, because visible slide is the last node.
         *
         */
        next: function () {
            this.currentIndex = this.currentIndex === 0 ? this._slides.length - 1 : this.currentIndex - 1;
            this.show(this.currentIndex);
        },

        /**
         *
         * addSlides() builds kenburnsy DOM structure.
         * @param <Array> images
         * @return <Array> images
         *
         */
        addSlides: function (images) {
          const el = this.el;

          return $.map(images.reverse(), function (url) {
              const slide = document.createElement('div');
              slide.style.backgroundImage = 'url(' + url.src + ')';
                slide.className = 'slide';

                el.appendChild(slide);

                return slide;
            });
        },

        /**
         *
         * buildScene() clears contents of el node and starts animation loop
         * @param <Array>, images
         *
         */
        buildScene: function (images) {
          const _this = this,
            settings = this.settings;

          this.el.innerHTML = '';

            this._slides = this.addSlides(images);

            this.currentIndex = images.length - 1;

            if (!settings.fullscreen) {
                this.el.style.height = this.settings.height || (images[this.currentIndex].height + 'px');
            }

            this.animate(this.currentIndex);
            setInterval(function () {
                _this.next();
            }, (settings.duration - settings.fadeInDuration) );
        }
    });

    // A really lightweight plugin wrapper around the constructor,
    // preventing against multiple instantiations
    $.fn[ pluginName ] = function ( options ) {
        this.each(function() {
            if ( !$.data( this, 'plugin_' + pluginName ) ) {
                $.data( this, 'plugin_' + pluginName, new Plugin( this, options ) );
            }
        });

        // chain jQuery functions
        return this;
    };

})( jQuery, window, document );