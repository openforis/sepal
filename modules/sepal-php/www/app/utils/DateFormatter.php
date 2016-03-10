<?php

class DateFormatter {
    public static function since($since) {
        $now = new DateTime("now");
        $diff = date_diff($now, $since);
        $timemsg = '';
        if ($diff->y > 0)
            $timemsg = $diff->y . ' year' . ($diff->y > 1 ? "s" : '');
        else if ($diff->m > 0)
            $timemsg = $diff->m . ' month' . ($diff->m > 1 ? "s" : '');
        else if ($diff->d > 0)
            $timemsg = $diff->d . ' day' . ($diff->d > 1 ? "s" : '');
        else if ($diff->h > 0)
            $timemsg = $diff->h . ' hour' . ($diff->h > 1 ? "s" : '');
        else if ($diff->i > 0)
            $timemsg = $diff->i . ' minute' . ($diff->i > 1 ? "s" : '');
        else if ($diff->s > 0)
            $timemsg = $diff->s . ' second' . ($diff->s > 1 ? "s" : '');
        $timemsg = $timemsg . ' ago';
        return $timemsg;
    }
}