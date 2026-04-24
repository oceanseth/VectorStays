<?php

$filesStartingWith = __DIR__ . '/lastrun_';

$lastRuns = glob($filesStartingWith . '*');

foreach ($lastRuns as $lastRun) {
    if (is_file($lastRun) && unlink($lastRun)) {
        echo 'deleted: ' . $lastRun . PHP_EOL;
    } else {
        echo 'couldn\'t delete ' . $lastRun;
    }
}