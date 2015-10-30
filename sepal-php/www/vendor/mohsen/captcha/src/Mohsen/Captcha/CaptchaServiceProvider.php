<?php namespace Mohsen\Captcha;

use Illuminate\Support\ServiceProvider;

class CaptchaServiceProvider extends ServiceProvider {

	/**
	 * Indicates if loading of the provider is deferred.
	 *
	 * @var bool
	 */
	protected $defer = false;

	/**
	 * Bootstrap the application events.
	 *
	 * @return void
	 */
	public function boot()
	{
		$this->package('mohsen/captcha');
		require __DIR__ . '/../../routes.php';
		require __DIR__ . '/../../validation.php';
	}

	/**
	 * Register the service provider.
	 *
	 * @return void
	 */
	public function register()
	{
		$this->app['captcha'] = $this->app->share(function($app) {
      return new Captcha;
    });
    
    $this->app->booting(function() {
      $loader = \Illuminate\Foundation\AliasLoader::getInstance();
      $loader->alias('Captcha', 'Mohsen\Captcha\Facades\Captcha');
    });
	}

	/**
	 * Get the services provided by the provider.
	 *
	 * @return array
	 */
	public function provides()
	{
		return array();
	}

}
