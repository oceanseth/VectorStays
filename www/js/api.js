var APIPATH = '/api.php';
var BNBTRACKERAPI = 'https://bnbtracker.stayintel.com/api/';
window.user = JSON.parse(localStorage.getItem("user"));
var apicallloadinghidetimeout;
function api(data,callback,silent) {
    if(apicallloadinghidetimeout) {
        clearTimeout(apicallloadinghidetimeout);
        if(!silent) {
            $("#loadingModal").modal('hide');
        }
    }

    if(!('method' in data)) {
        data.method = arguments.callee.caller.name;
    }
    mixpanel.track(data.method);
    if(user) {
        data.token=user.token;
    }
    if(Vector.selectedUserId) {
        data.selectedUserId=Vector.selectedUserId;
    }
    if('selectedFilters' in Vector) {
        if(!('filters' in data)) { //allow override of filters manually
            data.filters = JSON.stringify(Vector.selectedFilters);
        }
    }
    if(!('start' in data) && Vector.startDateFilter)  {
        data.start = Vector.startDateFilter.format("YYYY-MM-DD");
    }
    if(!('end' in data) && Vector.endDateFilter) {
        data.end = Vector.endDateFilter.format("YYYY-MM-DD");
    }
    if(data.method.indexOf("save")!=-1) {
        $("#loadingModalHeader").html("Saving");
    } else {
        $("#loadingModalHeader").html("Loading");
    }
    if(!silent) $("#loadingModal").modal('show');

    var apipath = APIPATH;

    if('APIPATH' in data) {
        apipath = data.APIPATH;
        delete(data.APIPATH);
    }

    $.post(apipath, data, function(response) {
        $("#loadingModal").modal('hide');
        if(response!='ok' && 'Error' in response) {
            if(response.Error=='User token expired, please login.') {
                logout();
            }
            alert('Error:'+response.Error);
            $("#loadingModal").modal('hide');
            return;
        }
        if(callback) callback(response);
        setTimeout(function() {
            $("#loadingModal").modal('hide');
        },500);
    }, "json");
    apicallloadinghidetimeout=setTimeout(function() {
        $("#loadingModal").modal('hide');
    },0);
}

function login() {
    api({
        username:$("#username").val(),
        password:$("#password").val()
    }, function(response) {
        if('Error' in response) {
            alert('Error:'+response.Error);
            return;
        }
        window.user = response.user;
        localStorage.setItem('user',JSON.stringify(response.user));

        // Sign into Firebase (vectorsupportagent app) so the browser can
        // subscribe to live call transcripts. Firebase persists its own
        // session across reloads, so we only need this at login time.
        var done = function () { window.location.reload(); };
        if (response.firebaseToken && window.callsAuth) {
            window.callsAuth.signInWithCustomToken(response.firebaseToken)
                .then(done)
                .catch(function (e) {
                    console.warn('Firebase signInWithCustomToken failed:', e.message);
                    done();
                });
        } else {
            done();
        }
    });
}

function logout() {
    localStorage.removeItem('user');
    if (window.callsAuth) {
        try { window.callsAuth.signOut(); } catch (e) {}
    }
    window.location.reload();
}

function showLogin()  {
    $("#wrapper").hide();
    $("#loginwrapper").show();
}

function removeCSVItem(csv,i) {
    if(csv=='') return '';
    csv=csv.replace(i+',','');
    csv=csv.replace(','+i,'');
    csv=csv.replace(i,'');
    return csv;
}

function addCSVItem(csv,i) {
    if(csv=='') return i;
    return csv+','+i;
}

String.prototype.moneyString = function() {
    if(isNaN(this)) return this;
    var s = parseFloat(this).toFixed(2);
    return "$"+s.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
};

String.prototype.hashCode = function() {
    var h = 0, l = this.length, i = 0;
    if ( l > 0 )
        while (i < l)
            h = (h << 5) - h + this.charCodeAt(i++) | 0;
    return h;
};

Number.prototype.moneyString = function() {
    if(isNaN(this)) return this;
    return "$"+this.toFixed(2).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

function bnbtrackerapi(data,callback,silent) {
    if(!('method' in data)) {
        data.method = arguments.callee.caller.name;
    }

    data.user_id = window.bnbTrackerUserId;
    /* var logdata = Object.assign({},data);
    logdata.bnbtrackermethod = logdata.method;
    logdata.method='log';
    api(logdata, 0, 1); */
    data.APIPATH = BNBTRACKERAPI;
    api(data,callback,silent);
}
