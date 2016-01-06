<?php

Route::get('/captcha/{hashedUrl}', function($hashedUrl) {
	return Captcha::create($hashedUrl);
});