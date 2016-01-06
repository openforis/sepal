<?php

Class ContactusController extends \BaseController {

    protected $layout = 'layouts.master';

    public function contactUs() {

        $this->layout->content = View::make('contact.contact');
    }

    public function contact() {
        Validator::extend('alpha_spaces', function($attribute, $value) {
                    return preg_match('/^[\pL\s]+$/u', $value);
                });
        // Validation rules
        $rules = array(
            'contactName' => 'required|min:4|alpha_spaces',
            'contactEmail' => 'required|email',
            'contactPhone' => 'required',
            'userCaptcha' => 'required|captcha'
        );
        $messages = array('captcha' => 'Invalid captcha',
            'alpha_spaces' => 'The :attribute may only contain letters and spaces');

        // Validate the inputs
        $v = Validator::make(Input::all(), $rules, $messages);
        // Setting attribute for readable format   
        $attributeNames = array(
            'contactName' => 'name',
            'contactEmail' => 'email',
            'contactPhone' => 'phone'
        );
        $v->setAttributeNames($attributeNames);
        // Was the validation successful?
        if ($v->fails()) {
            return Redirect::to('contact')
                            ->withErrors($v)
                            ->withInput();
        } else {
            $contact = array();
            $contact['contactName'] = Input::get('contactName');
            $contact['contactEmail'] = Input::get('contactEmail');
            $contact['contactPhone'] = Input::get('contactPhone');
            $contact['contactMessage'] = Input::get('contactMessage');
            $subject = 'SEPAL Enquiry';
            $body = View::make('contact.mail',$contact);
                       
            // setting the server, port and encryption
            $transport = Swift_SmtpTransport::newInstance('smtp.gmail.com', 465, 'ssl')
                    ->setUsername("phpuser@teamta.in")
                    ->setPassword("Phpuser12#");

            // creating the Swift_Mailer instance and pass the config settings
            $mailer = Swift_Mailer::newInstance($transport);

            // configuring the Swift mail instance with all details
            $message = Swift_Message::newInstance($subject)
                    ->setFrom(array('phpuser@teamta.in' => 'SEPAL App'))
                    ->setTo(array('seetharaman.m@teamta.in' => 'Nimmy'))
                    ->setBody($body, 'text/html');

            try {
                $mailer->send($message);
                $movedImages = 'Thank You for contacting us';
                $data['movedImages'] = $movedImages;
                $this->layout->content = View::make('contact.contact', $data);
                //echo 'Thank You for contacting us';
            } catch (Exception $e) {
                echo $e->getMessage();
            }
        }
    }

}
