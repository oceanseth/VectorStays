<?php
/**
 * Copy this file to tools/config.php and fill in your secrets.
 * tools/config.php is gitignored.
 */
require __DIR__ .'/../vendor/autoload.php';
ini_set("user_agent", "Mozilla/5.0 (Windows; U; Windows NT 5.1; rv:1.7.3) Gecko/20041001 Firefox/0.10.1");
ini_set('display_errors', 0);
ini_set('mysql.connect_timeout', 40000);
ini_set('default_socket_timeout', 40000);
define('HASHSALT', 'CHANGE-ME-LONG-RANDOM-STRING');
if(!defined('DEBUG_MYSQL')) {
    define('DEBUG_MYSQL', 0);
}

function getSubdomain() {
    return "vector";
}
define("DB_HOST", "localhost");
define("DB_USER", "vector");
define("DB_PASS", "your-mysql-password");
$subdomain="vector";
define('MASTER_DATABASE', 'stayintel');
define("DB_NAME", "vector");
define("MANDRILL_SECRET", "your-mandrill-secret");
date_default_timezone_set("America/Los_Angeles");
define("GUESTY_API", "https://open-api.guesty.com/v1/");

// Bland.ai voice agent — get a key from https://app.bland.ai
define("BLAND_AI_API_KEY", "org_...");
define("BLAND_AI_ORG_ID", "00000000-0000-0000-0000-000000000000");
define("BLAND_AI_API", "https://api.bland.ai/v1/");
define("BLAND_AI_INBOUND_NUMBER", "+10000000000");

// Slack support-transfer alerts
define("SLACK_BOT_TOKEN", "xoxb-...");
define("SLACK_ALERT_CHANNEL_ID", "C00000000");

// Public host used in links posted to Slack
define("VECTORSTAYS_PORTAL_HOST", "https://vision.vectorstays.com");

// Firebase (vectorsupportagent project) — used for live transcript push + auth for the calls portal
define("FIREBASE_PROJECT_ID", "vectorsupportagent");
define("FIREBASE_DATABASE_URL", "https://vectorsupportagent-default-rtdb.firebaseio.com");
define("FIREBASE_SERVICE_ACCOUNT_PATH", __DIR__ . "/secrets/vectorsupportagent-firebase-adminsdk.json");
?>
