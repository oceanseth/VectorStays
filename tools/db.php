<?php
/*
   Seth Caldwell
   Database Class : mySqli
*/
require_once(__DIR__."/config.php");
if(!defined('DEBUG_MYSQL')) {
    define('DEBUG_MYSQL', 1);
}
if (!defined('MYSQLI_OPT_READ_TIMEOUT')) {
    define ('MYSQLI_OPT_READ_TIMEOUT', 11);
}
class db
{
    /**
     * Database connection object.
     *
     * @var    object dbConn
     * @see    connect()
     */
    public $dbConn;

    /**
     * Current selected database object.
     *
     * @var    object currentDB
     * @see    select_db()
     */
    public $currentDB;

// cache the mysqli server information, and only make a db connection when an actual query is called.
    private $mydbserver;
    private $mydbuser;
    private $mydbpass;
    private $mydbport;

    /**
     * Connects to the database all quick like.
     *
     * @param  string  $dbserver Hostname[:port][:/path/to/socket]
     * @param  string  $dbuser Username
     * @param  string  $dbpass Password
     */
    public function connect($dbserver, $dbuser, $dbpass, $dbname, $dbport=3306)
    {
        $this->mydbserver = $dbserver;
        $this->mydbuser = $dbuser;
        $this->mydbpass = $dbpass;
        $this->mydbport = $dbport;
        $this->currentDB = $dbname;
        $this->dbConn="";
    }

    public function startConnection()
    {
        global $timezone;

        if ($this->dbConn == "") {
            $this->dbConn = mysqli_init();
            if(!$this->dbConn) {
                echo 'Database could not create connection.';
                exit;
            }
            $this->dbConn->options(MYSQLI_OPT_CONNECT_TIMEOUT, 200);
            $this->dbConn->options(MYSQLI_OPT_READ_TIMEOUT, 200);
            if ($this->mydbserver == "") return;  //servername not defined, cannot connect
            $this->dbConn->real_connect($this->mydbserver, $this->mydbuser, $this->mydbpass, $this->currentDB, $this->mydbport);
            $timezone='-07:00'; //needs to be used for this somehow
            mysqli_query($this->dbConn,"SET time_zone = '".$timezone."';");
            @date_default_timezone_set($timezone);
            mysqli_set_charset($this->dbConn,"utf8");
        }
    }
    /**
     * Selects a db
     *
     * @param	string	$dbname The name of the database to select
     */
    function select_db($dbname)
    {
        $this->currentDB=$dbname;
        if($this->dbConn!="") mysqli_select_db($this->dbConn, $dbname);
        else $this->startConnection();
    }

    /**
     * Runs a query on the selected db.
     *
     * @param	string	$querystring The query to run on the db.
     */
    function query($querystring)
    {
        if(DEBUG_MYSQL) error_log($querystring);
        $this->startConnection(); //ensure a connection is started

        $query= mysqli_query($this->dbConn,$querystring);
        $error = mysqli_error($this->dbConn);
        if($error!="") {
            error_log("Error in query: $querystring \n $error");
        }
        return $query;
    }

    /**
     * Fetches an array out of a queryID
     *
     * @param    resource    $queryID The query that just ran.
     */
    function fetch_array($queryID)
    {
        if ($queryID!="")
            return mysqli_fetch_array($queryID);

        return "";
    }

    /**
     * Fetch an array of objects from a queryID
     * @param  string    $query The query to run.
     */
    function fetchAll($query)
    {
        $toReturn = array();
        $queryID = $this->query($query);
        if($queryID)
            while ($d = mysqli_fetch_object($queryID)) {
                $toReturn[] = $d;
            }
        return $toReturn;
    }
    function fetchOne($query)
    {
        $queryID = $this->query($query);
        if($this->num_rows($queryID)==0) return FALSE;
        return $this->fetch_object($queryID);
    }
    function fetchValue($q)
    {
        $queryId = $this->query($q);
        $q = mysqli_fetch_array($queryId);
        if($q===false) return false;
        return $q[0];
    }
    /**
     * Fetch an object from a queryID
     *
     * @param    resource    $queryID The query that just ran.
     */
    function fetch_object($queryID)
    {
        if($queryID!="")
            return mysqli_fetch_object($queryID);

        return "";
    }

    /**
     * Free the result in memory.
     *
     * @param    resource    $resultID The result of a query.
     */
    function free_result($resultID)
    {
        mysqli_free_result($resultID);
    }

    /**
     * Gets the ID of the last Insert operation.
     */
    function insert_id()
    {
        return mysqli_insert_id($this->dbConn);
    }

    /**
     * List result fields.
     *
     * @param    string    $dbname Name of the database.
     * @param    string    $tablename Name of the table you want the field of.
     */
    function list_fields($dbname,$tablename)
    {
        return mysqli_list_fields($dbname,$tablename);
    }

    /**
     * Returns the number of rows in a result.
     *
     * @param    resource    $result The result of a query.
     */
    function num_rows($result)
    {
        return @mysqli_num_rows($result);
    }

    /**
     * Gets number of affected rows in previous operation.
     *
     * @param    string    $query Query to run.
     */
    function affected_rows()
    {
        return @mysqli_affected_rows($this->dbConn);
    }

    public function escape($value = "", $nullify = false) {
        $this->startConnection();
        //reset default if second parameter is skipped
        $nullify = ($nullify === null) ? (false) : ($nullify);
        //undo slashes for poorly configured servers

        //check for null/unset/empty strings (takes advantage of short-circuit evals to avoid a warning)
        if ((!isset($value)) || (is_null($value)) || ($value === "")) {
            $value = ($nullify) ? ("NULL") : ("''");
        }
        else {
            if (is_string($value)) {
                //value is a string and should be quoted; determine best method based on available extensions
                if (function_exists('mysqli_real_escape_string')) {
                    $value = "'" .(mysqli_real_escape_string($this->dbConn, $value)) . "'";
                }
                else {
                    $value = "'" . mysqli_escape_string($this->dbConn, $value) . "'";
                }
            } else if(is_bool($value) || gettype($value)=='boolean') {
                if($value) return 1; else return 0;
            } else {
                //value is not a string; if not numeric, bail with error
                $value = (is_numeric($value)) ? ($value) : ("'ERROR: unhandled datatype in quote_smart type is:".gettype($value)."'");
            }
        }
        return $value;
    }

    function escapeLike($value="",$nullify=false)
    {
        $value = str_replace('%','',$value);
        $value = str_replace('_','',$value);
        return $this->escape($value,$nullify);
    }

    function error() {
        return mysqli_error($this->dbConn);
    }

}
$db = new db();
if(!defined('DB_PORT')) define('DB_PORT', 3306);
$db->connect(DB_HOST, DB_USER, DB_PASS, DB_NAME, DB_PORT);

function s($s) {
    global $db;
    return $db->escape($s);
}

function i($s) {
    return intval($s);
}
function f($s) {
    return floatval($s);
}
