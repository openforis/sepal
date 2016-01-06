#Captcha

> A simple captcha for laravel 4 

## Preview

![Preview](http://aparnet.ir/wp-content/uploads/2014/04/captcha.png)

##How to setup

update `composer.json` file:

```json
{
    "require": {
        "laravel/framework": "4.1.*",
        "mohsen/captcha": "dev-master"
    }
}
```

and run `composer update` from terminal to download files.

update `app.php` file in `app/config` directory:

```php
'providers' => array(
  ...
  'Mohsen\Captcha\CaptchaServiceProvider',
  ...
),
...
'aliases' => array(
  ...
  'Captcha'		  => 'Mohsen\Captcha\Captcha',
  ...
),
```

##How to use

in your HTML form add following code:

```html
<img src="{{Captcha::getImage()}}">
<input type="text" name="user-captcha">
```

and for validate user entered data just add `captcha` to array validation rules.

```php
$rules = array(
  'user-captcha' => 'required|captcha'
);

$validator = Validator::make(Input::all(), $rules);

if($validator -> fails()) {
  return Redirect::back() -> withErrors($validator);
}
```

### Captcha::getImage() parameters

All parameters are optional.

```php
<img src="{{Captcha::getImage($count, $width, $height, $backgroundColor, $quality)}}">
```

`$count`: Number of characters [default=7]

`$width`: Width of image [default=160]

`$height`: Height of image [default=70]

`$backgroundColor`: Background color of image [default='efefef']

`$quality`: Quality of image [default=50]