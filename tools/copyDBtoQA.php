<?php
// To be run weekly to copy live db to qa db
include("config.php");
//$dbs = array("revestment","vector","stayintel","airbnb");
$dbs = array("revestment");
foreach($dbs as $db) {
    $filename = "temp_mysql_dump_$db.sql";
    $s = "mysqldump -u " . DB_USER . " -h " . DB_HOST . " -p" . DB_PASS . " $db > $filename";
error_log("dumping $db to temp_mysql_dump_$db.sql\n$s");
    system($s);

    if (isset($_REQUEST['download'.$db])) {
        header("Content-Type: ");
        header("Content-Disposition: attachment; filename=".$db.".sql");
        header('Content-Length: '.filesize($filename));
        header('Content-Type: '.mime_content_type($file));
        header('Expires: 0');
        header('Cache-Control: must-revalidate, post-check=0, pre-check=0');
        header('Pragma: public');
        header('Content-Transfer-Encoding: binary');
        ob_clean();
        flush();
        readfile($filename);
        exit;
    }
    // $s="mysql -u " . DB_USER . " -h " . DB_HOST . " -p" . DB_PASS . " ".$db."_qa < $filename";
    $s="mysql -u " . DB_USER . " -h " . DB_HOST . " -p" . DB_PASS . " qa < $filename";
error_log("import the dump to the qa db\n$s");
    system($s);
    $s="rm -f temp_mysql_dump_$db.sql";
error_log("delete the dump file\n$s");
    system($s);
}