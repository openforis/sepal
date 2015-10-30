<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <title>Mail</title>
    </head>

    <body>

        <table cellpadding="0" cellspacing="0" style="width:100%;  font-family:arial; font-size:14px;">
            <tr><td colspan="2" style="background:#0386ca; padding:10px; color:#fff;  font-weight:bold;"><img src="https://{{SdmsConfig::value('host')}}/images/sdms-logo.png" alt="logo" /></td></tr>

            <tr><td style="padding:10px; ">Name</td><td style="padding:10px; color:#888; ">@if(isset($contactName)) {{ $contactName }} @endif</td></tr>
            <tr><td style="padding:10px; ">email</td><td style="padding:10px;color:#888; ">@if(isset($contactEmail)) {{ $contactEmail }}@endif</td></tr>
            <tr><td style="padding:10px; ">Phone</td><td style="padding:10px; color:#888; ">@if(isset($contactPhone)) {{ $contactPhone }}@endif</td></tr>
            <tr><td style="padding:10px; ">Message</td><td style="padding:10px; color:#888; ">@if(isset($contactMessage)) {{ $contactMessage }}@endif</td></tr>

            <tr><td colspan="2" style="border-top: 2px solid #02284d; background-color: #f5f5f5;padding:10px; ">Copyright sdms 2014</td></tr>
        </table>

    </body>
</html>
