//to be run every few minutes, will currently sync all messages - eventually will pull reservations from here instead of guesty

const airbnb = require('airbnbapijs');
const admin = require("firebase-admin");
const mysql = require('mysql');
const config = require('../tools/config.json');
var con = mysql.createConnection(config.mysql);
config.firebase.credential = admin.credential.cert(config.firebase_service_account);

airbnb.setCurrency('USD');

admin.initializeApp(config.firebase);
var db = admin.database();

function save(path,data) {
    db.ref("/"+config.projectId+"/"+path).set(data);
}

function getIntegrations() {
    con.query("SELECT * FROM Integration", function (err, result, fields) {
        if(err) {
            console.log("Error in query: ",err);
        }
        else {
            for(var i in result) {
                syncIntegration(result[i]);
            }
        }
    });
}

function syncThread(t) {
    console.log("Syncing thread with id: "+t.id);
    save("airbnb/threads/"+t.id,t);
}

function syncIntegration(i) {
    if(i.type=='airbnb') {
        console.log("Syncing airbnb with username:"+i.username);
        if (i.token==null) {
                airbnb.newAccessToken({username:i.username, password:i.password}).then(function(o) {
                    console.log("got new token: "+o.token);
                    i.token=o.token;
                    con.query("update Integration set token='"+o.token+"' where _id="+i._id, function(err,result) {
                        if (err) {
                            console.log("sql error",err);
                            throw err;
                        }
                        console.log(result.affectedRows + " record(s) updated");
                        syncIntegration(i);
                    });
                }).catch(err => {
                    // Will not execute
                    console.log('caught', err.message);
                });
        }
        else {
            console.log("Calling getThreadsFull");
            airbnb.getThreadsFull({
                token: i.token,
                offset: 0,
                limit: 50
            }).then(function (data) {
                console.log("Got "+data.length+" threads.");
                for(var i in data) {
                    syncThread(data[i]);
                }
            }).catch(err=>{
                console.log('caught', err.message);
            });
        }
    }
}

con.connect(function(err) {
    if (err) {
        console.log("error connecting to mysql.",err);
        throw err;
    }
    console.log("connected successfully to mysql");
    getIntegrations();
});

