<?php
require_once('db.php');
require_once('Guesty.php');
error_log("using guesty webhooks");
$guestyLogin = $db->fetchOne('select username,password from Integration where type="guesty"');
$g = new Guesty($guestyLogin->username,$guestyLogin->password);
$me = $g->query('accounts/me');
echo "Using guesty account ".$me->_id."\n";
$response = $g->query('webhooks');
print_r($response);
$line = readline("\nEnter 1 to create webhook, 2 to delete: ");
if($line=='1') {
    echo "\nCreating account.";
    $g->query('webhooks',array(
    'url'=>'https://vision.vectorstays.com/guesty_hook.php',
    'accountId'=>$me->_id,
    'events'=>array('guest.created','guest.deleted','guest.updated','listing.updated','listing.calendar.updated','payments.failed','reservation.messageReceived',
      'reservation.new','reservation.updated','reservation.messageSent','reservation.reviewed','task.created','task.deleted','task.updated')
    ),'POST');
} elseif($line=='2') {
    $id = readline("\nEnter webhook id:");
    $g->query('webhooks/'.$id,array(),'DELETE');
}
