function readURL(input) {

    if (input.files && input.files[0]) {
        var reader = new FileReader();

        reader.onload = function(e) {
            $('#imageUploadPreview').attr('src', e.target.result);
            var img2 = document.getElementById("imageUploadPreview");
            EXIF.getData(img2, function() {
                var allMetaData = EXIF.getAllTags(this);
                var allMetaDataSpan = document.getElementById("allMetaData");
                allMetaDataSpan.innerHTML = JSON.stringify(allMetaData, null, "\t");
            });
        }

        reader.readAsDataURL(input.files[0]);

    }

}

var map;
var compmap;
var compmapmarkers;
var selectedProperty;
var selectedComps=[];
var canvaspriceimages=[];
var mapIconComp = new Image();
var mapIconSelectedComp = new Image();
mapIconSelectedComp.src="images/mapIconComp.png";
mapIconComp.src = "images/mapIconSelectedComp.png";
var occrows = [];
var adrrows = [];
var revrows = [];
var currentComps;
var currentCompElements;

var daily_adrrows = [];
var daily_occrows = [];

var monthly_occrows = [];
var monthly_adrrows = [];
var monthly_revrows = [];

//charts - each has different set of columns
var chartdata; //used for rev metrics chart
var monthly_chartdata; //used for weekly/monthly adr/occ/rev charts
var daily_adr_chart;
var daily_occ_chart;
var daily_rev_chart;


var monthly_booked_occrows = [];
var weekly_booked_occrows = [];

/*
var yearly_occrows = [];
var yearly_adrrows = [];
var yearly_revrows = [];
var yearly_chartdata;
*/

var weekly_occrows = [];
var weekly_adrrows = [];
var weekly_revrows = [];
var weekly_chartdata;


function initCompMap(mapcenter) {
    var mapOptions = {
        zoom: 12,
        center: mapcenter,
        mapTypeId: google.maps.MapTypeId.ROADMAP
    };
    compmap = new google.maps.Map(document.getElementById("compmap"), mapOptions);
    compmap.mapTypes.set('map_style', googleStyledMap);
    compmap.setMapTypeId('map_style');

    google.maps.event.addListener(compmap, 'bounds_changed', Vector.updateMapCount);

}
function refreshCache() {
    api({},()=>{ alert('cache refreshed.')},1);
}

function addListenersToChart(chart) {
    google.visualization.events.addListener(chart,'select',function() {
        $("#chart_legend a").removeClass("selected");
        $("#chart_legend a:nth-child("+(chart.getSelection())[0].column+")").addClass("selected");
    });
    google.visualization.events.addListener(chart,'onmouseover',function(target) {
        $("#chart_legend a:nth-child("+target.column+")").addClass("hovered");
    });
    google.visualization.events.addListener(chart,'onmouseout',function(target) {
        $("#chart_legend a").removeClass("hovered");
    });

    $("#chart_legend a").off().hover(function() {
        $(this).addClass("hovered");
        chart.setSelection([{row:null,column:$(this).index()+1}]);
    },function() {
        $(this).removeClass("hovered");
        chart.setSelection([]);
    });
}

function hideDataTablesAndCharts() {
    $(".fixedOptimizerTable,#adr_chart,#rev_chart,#occ_chart,#chart_legend,"+
        "#compPricing,#weeklyMetricsTable,#yearlyMetricsTable,#monthlyMetricsTable,"+
        "#monthly_rev_chart,#monthly_adr_chart,#monthly_occ_chart, #compPricingGraph").hide();
    $("#daily_chart_btn").show();

    if($("#metrics_table_btn").hasClass("selected")) {
        if ($("#daily_chart_btn").hasClass("selected")) {
            $(".fixedOptimizerTable").show();
            $("#compPricing").show();
            $("#bookedDatesToggler").show();
        } else {
            $("#bookedDatesToggler").hide();
            if($("#weekly_chart_btn").hasClass("selected")) {
                $("#weeklyMetricsTable").show();
            } else {
                $("#monthlyMetricsTable").show();
            }
        }
    } else if($("#bookedADRToggler").hasClass("selected")) {
        showBookedADRChart();
    } else if($("#adr_chart_btn").hasClass("selected")) {
        showADRChart();
    } else if ($("#occ_chart_btn").hasClass("selected")) {
        showOCCChart();
    } else if ($("#rev_chart_btn").hasClass("selected")) {
        if($("#daily_chart_btn").hasClass("selected")) {
            $("#daily_chart_btn").removeClass("selected");
            $("#monthly_chart_btn").addClass("selected");
        }
        $("#daily_chart_btn").hide();
        showRevChart();
    }
}
function showADRChart() {
    var seriesdata = {};
    var isDaily = $("#daily_chart_btn").hasClass("selected");
    var rowstouse = isDaily?daily_adrrows:
        $("#monthly_chart_btn").hasClass("selected")?monthly_adrrows:weekly_adrrows;
    var xaxis = isDaily?"Day":
        $("#monthly_chart_btn").hasClass("selected")?"Month":"Week";
    seriesdata[rowstouse[0].length-2] = {type: 'line'};
    var charttouse = isDaily?daily_adr_chart:monthly_chartdata;
    var options = {
        colors: app_configs.googleColors,
        hAxis: {
            title: xaxis,
            titleTextStyle: {
                italic:false
            }
        },
        vAxis: {
            title: 'ADR',
            titleTextStyle: {
                italic:false
            }
        },
        seriesType: 'bars',

        series: seriesdata,

        animation: {
            duration: 500,
            startup: true
        },
        legend: isDaily?{}:{ position:'none' }
    };
    charttouse.removeRows(0,charttouse.getNumberOfRows());
    charttouse.addRows(rowstouse);

    $("#monthly_adr_chart").show();

    var chart = new google.visualization.ComboChart(document.getElementById('monthly_adr_chart'));
    chart.draw(charttouse, options);
    if(!isDaily) $("#chart_legend").fadeIn();
    addListenersToChart(chart);
}
function showOCCChart() {
    var seriesdata = {};
    var isDaily = $("#daily_chart_btn").hasClass("selected");
    var rowstouse = isDaily?daily_occrows:
        $("#monthly_chart_btn").hasClass("selected")?monthly_occrows:weekly_occrows;
    var xaxis = isDaily?"Day":
        $("#monthly_chart_btn").hasClass("selected")?"Month":"Week";
    var charttouse = isDaily?daily_occ_chart:monthly_chartdata;

    seriesdata[rowstouse[0].length-2] = {type: 'line'};
    var options = {
        colors: app_configs.googleColors,
        hAxis: {
            title: xaxis,
            titleTextStyle: {
                italic:false
            }
        },
        vAxis: {
            title: 'Occupancy',
            titleTextStyle: {
                italic:false
            }
        },
        seriesType: 'bars',

        series: isDaily?{}:seriesdata,

        animation: {
            duration: 500,
            startup: true
        },
        legend: isDaily?{}:{ position:'none' }
    };
    charttouse.removeRows(0,charttouse.getNumberOfRows());
    charttouse.addRows(rowstouse);
    $("#monthly_occ_chart").show();
    var chart = new google.visualization.ComboChart(document.getElementById('monthly_occ_chart'));
    chart.draw(charttouse, options);
    if(!isDaily) {
        $("#chart_legend").fadeIn();
    }
    addListenersToChart(chart);
}

function showRevChart() {
    var seriesdata = {};
    var isDaily = $("#daily_chart_btn").hasClass("selected");
    var rowstouse = isDaily?daily_revrows:
        $("#monthly_chart_btn").hasClass("selected")?monthly_revrows:weekly_revrows;
    var xaxis = isDaily?"Day":$("#monthly_chart_btn").hasClass("selected")?"Month":"Week";
    var charttouse = isDaily?daily_occ_chart:monthly_chartdata;

    seriesdata[rowstouse[0].length-2] = {type: 'line'};
    var options = {
        colors: app_configs.googleColors,
        hAxis: {
            title: xaxis,
            titleTextStyle: {
                italic:false
            }
        },
        vAxis: {
            title: 'Revenue',
            titleTextStyle: {
                italic:false
            }
        },
        seriesType: 'bars',
        series: seriesdata,
        animation: {
            duration: 500,
            startup: true
        },
        legend: { position:'none' }
    };
    charttouse.removeRows(0,charttouse.getNumberOfRows());
    charttouse.addRows(rowstouse);
    $("#monthly_rev_chart").show();
    var chart = new google.visualization.ComboChart(document.getElementById('monthly_rev_chart'));
    chart.draw(charttouse, options);

    $("#chart_legend").fadeIn();
    addListenersToChart(chart);
}
function showBookedADRChart() {
    $("#compPricingGraph").show();
    var rowstouse = $("#daily_chart_btn").hasClass("selected")?occrows:
        $("#monthly_chart_btn").hasClass("selected")?monthly_booked_occrows:weekly_booked_occrows;

    var seriesdata = {};
    if(rowstouse.length>1) {
        seriesdata[rowstouse[0].length - 2] = {type: 'line', curveType: 'function'};
        seriesdata[rowstouse[0].length - 3] = {type: 'line', curveType: 'function'};
        seriesdata[rowstouse[0].length - 4] = {type: 'line', curveType: 'function'};
    }
    var options = {
        hAxis: {
            colors: app_configs.googleColors,
            title: 'Date',
            textStyle: {
                color: "#000",
                fontSize: '14'
            },
            titleTextStyle: {
                italic:false
            }
        },
        vAxis: {
            title: 'Revenue',
            titleTextStyle: {
                italic:false
            }
        },
        seriesType: 'bars',
        curveType: 'function',
        series: seriesdata,
        animation: {
            duration: 500,
            startup: true
        }
    };
    chartdata.removeRows(0,chartdata.getNumberOfRows());
    chartdata.addRows(rowstouse);
    var chart = new google.visualization.ComboChart(document.getElementById('compPricingGraph'));
    chart.draw(chartdata, options);
}

function htmlEncode( html ) {
    return document.createElement( 'a' ).appendChild(
        document.createTextNode( html ) ).parentNode.innerHTML;
};

function htmlDecode( html ) {
    var a = document.createElement( 'a' ); a.innerHTML = html;
    return a.textContent;
};

function showLoading(e) {
    $(e).html("<div class='uil-default-css' style='transform:scale(0.6);'><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(0deg) translate(0,-60px);transform:rotate(0deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(30deg) translate(0,-60px);transform:rotate(30deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(60deg) translate(0,-60px);transform:rotate(60deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(90deg) translate(0,-60px);transform:rotate(90deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(120deg) translate(0,-60px);transform:rotate(120deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(150deg) translate(0,-60px);transform:rotate(150deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(180deg) translate(0,-60px);transform:rotate(180deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(210deg) translate(0,-60px);transform:rotate(210deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(240deg) translate(0,-60px);transform:rotate(240deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(270deg) translate(0,-60px);transform:rotate(270deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(300deg) translate(0,-60px);transform:rotate(300deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(330deg) translate(0,-60px);transform:rotate(330deg) translate(0,-60px);border-radius:10px;position:absolute;'></div></div>");
}

function getMetricsForProperties(properties, startDate, endDate) {
    bnbtrackerapi({properties: properties, startDate:startDate.format("YYYY-MM-DD"), endDate:endDate.format("YYYY-MM-DD")}, function(result) {
        var resultmonths = result.months,
            revChartData = [],
            occChartData = [],
            listingOccupancyTemplate = {
                dataType:'percent'
            },
            chartLabels = [],
            monthNames = moment.months(),
            listingRevenue,
            listingOccupancy,
            i;

        const formatCell = function (value, object, index) {
           var type = Object.keys(object)[index];
           value = parseFloat(value).toFixed(2);
           if (type == 'op') {
               return value + '%';
           }
           return '$' + value;
       }

        const fillRow = function (rowObject) {
           return Object.values(rowObject).reduce(function(html, td, index) {
               html += "<td>" + formatCell(td, rowObject, index) + "</td>";
               return html;
            }, '');
        }

        var dataTableHead = "<thead><tr><th rowspan='2'>Property</th>";

        for(i = startDate.month(); i <= endDate.month(); i++) {
            dataTableHead += "<th colspan='3' style='text-align: center;'>" + monthNames[i] + "</th>";
            chartLabels.push(monthNames[i]);
        }
        dataTableHead += "</tr><tr>";
        for(i = startDate.month(); i <= endDate.month(); i++) {
            dataTableHead += "<th>ADR</th>";
            dataTableHead += "<th>REV</th>";
            dataTableHead += "<th>OCC</th>";
        }
        dataTableHead += "</tr></thead>";

        var dataTableBody = "<tbody>";

        var listingsSorted = Object.keys(resultmonths).sort(function (a, b) {
            return a == selectedProperty.id ? -1 : 1;
        });

        Vector.resetColorIndex();
        listingsSorted.forEach(function (row) {
            var img, comp, month;
            var color = Vector.getColor();

            if (row == selectedProperty.id) {
                dataTableBody += "<tr class='subjectrow'>";
                img = selectedProperty.thumbnail_url;
                listingName = selectedProperty.name
            } else {
                dataTableBody += "<tr>";
                comp = selectedComps.find(function (listing) { return listing.id == row });
                img = comp.thumbnail_url;
                listingName = comp.name;
            }

            dataTableBody += "<td><a target='_blank' href='http://www.airbnb.com/rooms/" + row+ "'>";
            dataTableBody += "<img src='" + img + "' width='100'></a></td>";

            listingRevenue = Object.assign({data:[], label: listingName}, color);
            listingOccupancy = Object.assign({data:[], label: listingName}, listingOccupancyTemplate, color);

            for (month in resultmonths[row]) {
                dataTableBody += fillRow(resultmonths[row][month]);
                listingOccupancy.data.push(resultmonths[row][month].op);
                listingRevenue.data.push(resultmonths[row][month].bookedrev);
            }

            dataTableBody += "</tr>";

            revChartData.push(listingRevenue);
            occChartData.push(listingOccupancy);
        });

        dataTableBody += "</tbody>";

        $("#monthlyTable").html("<h4 class='m-t-0 header-title'>Monthly table</h4><br><table class='p-1 table w-100'>" + dataTableHead + dataTableBody + "</table>");
        $("#monthlyTable").find("table").DataTable({
            bFilter: false,
            bInfo: false
        });

        var monthlyRevChart = {
            labels: chartLabels,
            datasets: revChartData
        };

        var monthlyOccChart = {
            labels: chartLabels,
            datasets: occChartData
        };

        $('#monthlyRevenueChartContainer').html('<canvas id=\"monthlyOccChart\"></canvas>');
        $('#monthlyOccChartContainer').html('<canvas id=\"monthlyRevChart\"></canvas>');
        $.ChartJs.respChart(
            'monthlyRevChart',
            'Bar',
            monthlyRevChart,
            {
                chartTitle: 'Monthly Revenue<br/>',
                responsive: true,
            }
        );
        $.ChartJs.respChart(
            'monthlyOccChart',
            'Bar',
            monthlyOccChart,
            {
                chartTitle: 'Monthly Occupancy<br/>',
                responsive: true,
            }
        );
        waiting = false;

        if (document.contains($('.modal-backdrop')[0])) {
            $('.modal-backdrop').remove();
        }
    });
}
var waiting=false;
function getPricesForProperties(properties,startDate,endDate,cb) {
    waiting=true; //kind of a hack for now since there are two api calls
    getMetricsForProperties(properties,startDate,endDate);

    var month = startDate.format("YYYY-MM-01");
    var myInterval = setInterval(function() {

        if(waiting) return;
        else  clearInterval(myInterval);

        bnbtrackerapi({
            method:"getPricesForProperties",
            properties: properties,
            month: month,
            startDate: startDate.format("YYYY-MM-DD"),
            endDate: endDate.format("YYYY-MM-DD")},
            function(response) {
                var dataTableHead = "<thead><tr><th>Day: </th>";

                for(var d = startDate; !d.isAfter(endDate); d.date(d.date()+1)) {
                    dataTableHead += "<th "+((d.day()%6 == 0)? "class='weekend'" :"") + ">" + d.date() + "</th>";
                }

                dataTableHead += "</tr></thead>";

                var dataTableBody = "<tbody>";

                var listingsSorted = Object.keys(response).sort(function (a, b) {
                    return a == selectedProperty.id ? -1 : 1;
                });

                listingsSorted.forEach(function (listingId) {
                    var img;

                    if (listingId == selectedProperty.id) {
                        img = selectedProperty.thumbnail_url;
                    } else {
                        img = selectedComps.find(function (listing) { return listing.id == listingId }).thumbnail_url;
                    }

                    dataTableBody += "<tr><td><a target='_blank' href='http://www.airbnb.com/rooms/" + listingId + "'>";
                    dataTableBody += "<img src='" + img + "' width='150'></a></td>";
                    dataTableBody += Object.values(response[listingId]).reduce(function(html, day) {
                        html += "<td class='" +  (day.available == "1" ? "available" : "occupied") + "' >" + day.local_price + "</td>";
                        return html;
                    },'');

                    dataTableBody += "</tr>";
                });

                dataTableBody += "</tbody>";
                $("#dailyTable").html("<h4 class='m-t-0 header-title'>Daily table</h4><br><table class='p-1 table w-100 compTrackerTable'>" + dataTableHead + dataTableBody + "</table>");
                $("#dailyTable").find("table").DataTable({
                    bFilter: false,
                    bInfo: false
                });

                Vector.needToRefreshCompAnalytics=false;
                if(cb) cb();
        });
    });
}

function addListingElementToSelectedComps(l,listing) {
    var found=0;
    for(var i in selectedComps) {
        if(selectedComps[i].id==listing.id) {
            found=1; break;
        }
    }
    if(!found) selectedComps.push(listing);
    var p = $("<div id='listingTiny"+listing.id+"' class='listingTiny' "+
        "onMouseOver='$(\"#listingFloat"+listing.id+"\").css(\"display\",\"block\").css(\"left\",$(this).offset().left).css(\"top\",$(this).offset().top+60);'>"+
        "<img src='"+listing.thumbnail_url+"'>"+
        ""+
        "</div>");
    (function(p,listing) {
        p.mouseleave(function () {
            if($("#listingFloat" + listing.id).is(":hover")) return;
            $("#listingFloat"+listing.id).css("display", "none");
        });
    })(p,listing);

    p.click(function(){
        l.mapmarker.setAnimation(null);
        $("#listingFloat"+listing.id+" .squaredTwo").click();
    });

    p.hover(function() {
        l.mapmarker.setZIndex(google.maps.Marker.MAX_ZINDEX + 1);
        l.mapmarker.setAnimation(google.maps.Animation.BOUNCE);
    }, function() {
        l.mapmarker.setAnimation(null);
    });


    $("#listingFloat"+listing.id).remove();
    var listingFloat = $("<div class='listingFloat' id='listingFloat"+listing.id+"'></div>");

    (function(p,listing) {
        listingFloat.mouseleave(function () {
            if (p.is(":hover")) return;
            $("#listingFloat" + listing.id).css("display", "none");
        });
    })(p,listing);

    $(listingFloat).append(l);
    $("body").append(listingFloat);

    $("#selectedCompList").append(p);
}

function initMap(mapcenter) {
    if(!('googleMapStyle' in window)) {
        window.googleMapStyle = [{
            "featureType": "all",
            "elementType": "all",
            "stylers": [{"hue": "#e7ecf0"}]
        }, {
            "featureType": "administrative.province",
            "elementType": "geometry",
            "stylers": [{"visibility": "on"}]
        }, {
            "featureType": "administrative.province",
            "elementType": "geometry.stroke",
            "stylers": [{"visibility": "on"}, {"invert_lightness": true}, {"weight": "1.22"}]
        }, {
            "featureType": "administrative.locality",
            "elementType": "geometry",
            "stylers": [{"visibility": "simplified"}]
        }, {
            "featureType": "administrative.land_parcel",
            "elementType": "geometry",
            "stylers": [{"visibility": "on"}]
        }, {"featureType": "poi", "elementType": "all", "stylers": [{"visibility": "off"}]}, {
            "featureType": "road",
            "elementType": "all",
            "stylers": [{"saturation": -70}]
        }, {
            "featureType": "road.highway",
            "elementType": "geometry",
            "stylers": [{"visibility": "on"}, {"lightness": "0"}, {"weight": "0.78"}, {"color": "#908f91"}, {"saturation": "-3"}]
        }, {
            "featureType": "road.highway",
            "elementType": "geometry.fill",
            "stylers": [{"visibility": "on"}]
        }, {
            "featureType": "road.highway",
            "elementType": "geometry.stroke",
            "stylers": [{"visibility": "on"}]
        }, {
            "featureType": "road.highway.controlled_access",
            "elementType": "geometry",
            "stylers": [{"visibility": "on"}]
        }, {
            "featureType": "road.arterial",
            "elementType": "geometry",
            "stylers": [{"visibility": "on"}]
        }, {
            "featureType": "road.local",
            "elementType": "geometry.fill",
            "stylers": [{"visibility": "on"}]
        }, {
            "featureType": "transit",
            "elementType": "all",
            "stylers": [{"visibility": "off"}]
        }, {
            "featureType": "water",
            "elementType": "all",
            "stylers": [{"visibility": "simplified"}, {"saturation": -60}]
        }];
        window.googleStyledMap = new google.maps.StyledMapType(googleMapStyle, {name: "Styled Map"});
        window.mapOptions = {
            zoom: 12,
            center: mapcenter,
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            mapTypeControlOptions: {
                mapTypeIds: [google.maps.MapTypeId.ROADMAP, 'map_style']
            }
        };
    }
  //  map = new google.maps.Map(document.getElementById("map"), mapOptions);
    //map.mapTypes.set('map_style', googleStyledMap);
    //map.setMapTypeId('map_style');
}

function setupListingClicks(l,listing) {
    l.find(".listingName").click(function(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        evt.stopImmediatePropagation();
        window.open("http://www.airbnb.com/rooms/"+listing.id);
    });
    l.click(function(evt) {
        evt.stopPropagation();
        evt.preventDefault();
        evt.stopImmediatePropagation();
        if (l.parent().attr("id")=="compList") {
            //l.detach().appendTo("#selectedCompList");
            l.find(".squaredTwoInput").attr("checked",true);
            if('mapmarker' in l) l.mapmarker.setIcon(getMapIconFromPrice(selectedProperty.price,'s'));
            l.addClass("selectedComp");
            setTimeout(function() {
                $("#squaredTwoSelectedComp"+listing.id).attr("checked",true);
            },1000);
            l.detach();
            addListingElementToSelectedComps(l,listing);
            selectCompForListing(listing, selectedProperty);
        }
        else {
            l.detach().appendTo("#compList");
            l.find(".squaredTwoInput").attr("checked",false);
            if('mapmarker' in l) l.mapmarker.setIcon(getMapIconFromPrice(listing.price));
            l.removeClass("selectedComp");
            $("#listingTiny"+listing.id).remove();
            $("#listingFloat"+listing.id).remove();
            unselectCompForListing(listing, selectedProperty);
        }
    });

    if('thumbnail_urls' in listing) {
        l.hover(function (evt) {
            l.find(".hoverArrow").show();
        }, function (evt) {
            l.find(".hoverArrow").hide();
        });
        l.find(".hoverArrow").click(function (evt) {
            evt.stopPropagation();
            evt.preventDefault();
            evt.stopImmediatePropagation();
            if (!$(this).parent().data("imgindex")) $(this).parent().data("imgindex", 0);
            if ($(this).hasClass("hoverArrowRight")) { //move right
                var newIndex = $(this).parent().data("imgindex")+1;
                if(newIndex>=listing.thumbnail_urls.length) newIndex=0;
               // console.log(newIndex);
                $(this).parent().data("imgindex",newIndex);
                l.find(".listingThumb").attr("src",listing.thumbnail_urls[newIndex]);
            }
            else { //move left
                var newIndex = $(this).parent().data("imgindex")-1;
                if(newIndex<0) newIndex=listing.thumbnail_urls.length-1;
             //   console.log(newIndex);
                $(this).parent().data("imgindex",newIndex);
                l.find(".listingThumb").attr("src",listing.thumbnail_urls[newIndex]);
            }
        });
    }
};

function drawSelectedCompList(listings) {
    selectedComps = listings;
//remove old selected comp markers before drawing new ones
    $(".selectedComp").each(function(l) {
        if('mapmarker' in this) this.mapmarker.setMap(null);
    });
    $(".listingFloat").remove();
    $("#selectedCompList").html("");
    for(var i in listings) {
        var listing = listings[i];
        var l = $("#listingSmall").clone();
        l.attr("id","listingSmallComp"+listing.id);
        l.addClass("selectedComp");
        setupListingClicks(l,listing);

        if(listing.deleted=="1") {
            l.find(".statusMessage").html("Deleted from airbnb").show();
        }
        l.find(".listingThumb").attr("src",listing.thumbnail_url);
        l.find(".listingName").html(listing.name);
        l.find(".listingPrice").html("$"+listing.price);
        l.find(".listingPropertyType").html(listing.property_type);
        l.find(".squaredTwoInput").attr("id","squaredTwoSelectedComp"+listing.id).attr("checked",true);
        l.find("label").attr("for","squaredTwoSelectedComp"+listing.id);
        l.find(".listingBathrooms").html(parseInt(listing.bathrooms));
        l.find(".listingBedrooms").html(parseInt(listing.bedrooms));
        l.find(".listingBeds").html(parseInt(listing.beds));
        l.find(".listingGuests").html(listing.person_capacity);
        if(listing.star_rating) l.find(".listingStars").html(Array(parseInt(listing.star_rating)+1).join("<i class='fa fa-star'  style='margin-right:2px;'></i>"));
        l.find(".listingReviews").html("<i class='fa fa-comment' aria-hidden='true'></i><div>"+listing.reviews_count+"</div>");

        l.css("display","block");

        addListingElementToSelectedComps(l,listing);

        var m = new google.maps.Marker({
            position: new google.maps.LatLng(listing.lat,listing.lng),
            map:compmap,
            icon: getMapIconFromPrice(listing.price,'s')
        });

        compmapmarkers.push(m);
        l.mapmarker=m;
        (function(m,listing,l) {
            m.listingID = listing.id;
            m.addListener("click",function() {
                $("#listingSmallComp"+listing.id).parent().parent()[0].scrollTop=
                                  parseFloat($("#listingSmallComp"+listing.id)[0].offsetTop)-250;
            });
            var infowindow = new google.maps.InfoWindow();
            infowindow.setContent(listing.name);
            l.infowindow = infowindow;
            m.addListener("mouseover",function() {
                /*  if('image_preview' in m) {
                 m.image_preview.setMap(compmap);
                 return;
                 }
                 var pinIcon = new google.maps.MarkerImage(
                 comp.thumbnail_url,
                 new google.maps.Size(60, 40),
                 new google.maps.Point(65, 65),
                 new google.maps.Point(65, 65)
                 );
                 m.image_preview = new google.maps.Marker({
                 position: new google.maps.LatLng(comp.lat, comp.lng),
                 map: compmap,
                 icon: pinIcon,
                 zIndex: google.maps.Marker.MAX_ZINDEX + 1
                 });
                 */
               // infowindow.open(compmap,m);
                $("#listingTiny"+listing.id).find('img').css("border","3px solid #2d939b");
            });
            m.addListener("mouseout",function() {
                //m.image_preview.setMap(null);
              //  infowindow.close();
                $("#listingTiny"+listing.id).find('img').css("border","none");
            });

            l.hover(function() {
                //infowindow.open(compmap, m);
                m.setZIndex(google.maps.Marker.MAX_ZINDEX + 1);
                m.setAnimation(google.maps.Animation.BOUNCE);
            },function() {
                m.setAnimation(null);
                //infowindow.close();
            });

        })(m,listing,l);


    }
}
var canvaspriceimages=[];
var pendingDraw=[]; //used to make sure last request is the one that finishes
function selectCompForListing(comp,listing) {
    var myId=Math.random();
    pendingDraw=myId;
    var ids = [];
    if (Array.isArray(comp)) {
        ids = comp;
    } else {
        ids.push(comp.id);
    }
    bnbtrackerapi({ids:ids,listing_id:listing.id}, function(response) {
        Vector.needToRefreshCompAnalytics=true;
        Vector.needToRefreshCompList=true;
        if(pendingDraw!=myId) return;
        //drawSelectedCompList(response);
    });
}


function unselectCompForListing(comp,listing) {
    bnbtrackerapi({id:comp.id,listing_id:listing.id}, function(response) {
        Vector.needToRefreshCompAnalytics=true;
        Vector.needToRefreshCompList=true;
        // drawSelectedCompList(response);
    });
}

function getMapIconFromPrice(p,type) {
    if(type==undefined) type="";
    if(!((type+p) in canvaspriceimages)) {
        var c = document.createElement("canvas");
        c.width=38;
        c.height=33;
        var ctx=c.getContext("2d");
        ctx.drawImage(type=="s"?mapIconSelectedComp:mapIconComp,0,0);
        ctx.font="12px";
        ctx.fillText('$',4,14);
        if(parseInt(p)>999) {
           // console.log("price > 999: " + p);
            ctx.font="12px";
            ctx.fillText(p,8.5,14);
        }
        else if(parseInt(p)>99) {
            ctx.font="14px";
            ctx.fillText(p,10,15);
        }
        else {
            ctx.font="14px";
            ctx.fillText(p,13,15);
        }
        canvaspriceimages[type+p] = c.toDataURL("image/png");
        return canvaspriceimages[type+p];
    }
    return canvaspriceimages[type+p];
}

function convertToCSV(objArray) {
    var array = typeof objArray != 'object' ? JSON.parse(objArray) : objArray;
    var str = '';

    for (var i = 0; i < array.length; i++) {
        var line = '';
        for (var index in array[i]) {
            if (line != '') line += ','

            line += array[i][index];
        }

        str += line + '\r\n';
    }

    return str;
}

function exportCSVFile(headers, items, fileTitle) {
    if (headers) {
        items.unshift(headers);
    }
    var jsonObject = JSON.stringify(items);

    var csv = this.convertToCSV(jsonObject);

    var exportedFilenmae = fileTitle + '.csv' || 'export.csv';

    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });

    if (navigator.msSaveBlob) { // IE 10+
        navigator.msSaveBlob(blob, exportedFilenmae);
    } else {
        var link = document.createElement("a");

        if (link.download !== undefined) { // feature detection
            // Browsers that support HTML5 download attribute
            var url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", exportedFilenmae);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    }
}




$(function() {
    $("#btn-refresh-data").hover(function() {
        var currentTime = moment();
        var currentHour = currentTime.format('H');
        var lastUpdate = currentTime.format('H:00');
        if (currentTime.subtract(30,'m').format('H') == currentHour) {
            lastUpdate = moment().format('H:30');
        }
        $("#btn-refresh-data").attr('title', 'Get data updated at ' + lastUpdate + 'hr.');
    });
    //setup config variables
    document.title = app_configs.title;
    google.charts.load('current', {'packages':['corechart','bar','line']});
    $(".icon-c-logo").html("<img class='logoimg' src='../images/stayintellogo.png' style='max-width:60px; max-height:60px; padding:0.5rem;'>");
    $.fn.dataTable.ext.errMode = 'none';
    initMap();
    $(".menu-group-item").click(function() {
        $(this).parent().find(".menu-group-item").removeClass("selected");
        $(this).addClass("selected");
        hideDataTablesAndCharts();
    });

    if(typeof(user) === 'undefined' || user === null) {
        showLogin();
        return;
    } else {
        launch();
    }

    $("#imageUpload").change(function() {
        readURL(this);
    });
    $("#occupancySlider").slider({
        id: "occupancySliderComponent",
        range: true,
        value: [0, 100],
        ticks: [0,100],
        ticks_labels: ["0","100"],
        ticks_positions: [0, 100],
        tooltip_position: "bottom",
        tooltip: 'always',
        selection: 'before',
        formatter: function(value) {
            return 'Current value: ' + value;
        }
    });
    $("#occupancySliderComponent").on("slideStop",Vector.filterOnSliders);

    $("#priceSlider").slider({
        id: "priceSliderComponent",
        range: true,
        value: [0, 20000],
        ticks: [0,30,300,500,1000,20000],
        ticks_positions: [0,10,50,80,90,100],
        ticks_labels: ["0","$30","$300","$500","$1000","$20000"],
        tooltip_position: "bottom",
        tooltip: 'always',
        selection: 'before',
        formatter: function(value) {
            return 'Current value: ' + value;
        }

    });
    $("#priceSliderComponent").on("slideStop", Vector.filterOnSliders);

    $(window).on('popstate', function (e) {
       // console.log("popstate on window ", e);
        history.pushState(null,null,'#');
        var state = e.originalEvent.state;
        if (state !== null) {
         //   console.log(state);
        }
    });
    history.pushState(null,null,'#dashboard');
    history.pushState(null,null,'#');

});

window.moneyFormatter = function(data, type, row) {
    if(isNaN(data) || !data) return "n/a";
    return "$"+parseFloat(data).toFixed(2);
};

window.moneyFormatterNoCents = function(data, type, row) {
    if(data==undefined) return "";
    return "$"+parseFloat(data).toFixed(0);
};

window.dateFormatter = function(data, type, row) {
    return moment(data).format("MM/DD/YYYY");
}

function launch(){
    $("#wrapper").show();
    $("#loginwrapper").hide();
    $("#userInfo").html("Welcome "+user.username+"!");
    $(".usercommission").html(user.commission+"%");

    Vector.startDateFilter=ranges[moment().format("MMMM")][0];
    Vector.endDateFilter=ranges[moment().format("MMMM")][1];
    switch(user.role) {
        case 'admin': case 'superadmin':
            $("#side-menu-admindashboard a").addClass("subdrop");
            $(".callsAccess").show(); // Calls link lives outside adminOnly; show it explicitly for admins
            Vector.loadAdmin();
            break;
        case 'user':
            $("#side-menu-dashboard a").addClass("subdrop");
            Vector.loadUser();
            break;
        case 'support':
            // Support role sees only the calls portal — everything else hidden.
            $(".owner-portal").hide();
            $(".adminOnly").hide();
            $(".callsAccess").show();
            $("#side-menu-calls a").addClass("subdrop");
            if (window.VectorCalls) VectorCalls.bootstrap();
            break;
        default: alert(' no user role set');
    }

    // Hash routing for the calls portal. Admin/superadmin/support can all
    // deep-link to #calls or #call-<id>. For admin/superadmin, loadAdmin's
    // async callback may render the admin dashboard — defer hash routing to
    // ajaxStop so the call view wins.
    if (window.VectorCalls) {
        var h = window.location.hash || '';
        var isCallsHash = h === '#calls' || /^#call-/.test(h);
        if (isCallsHash && user.role !== 'support') {
            $(document).one('ajaxStop', function () { VectorCalls.handleHash(); });
        }
        $(window).on('hashchange', function () { VectorCalls.handleHash(); });
    }

    Vector.unitPerformanceCalendar=$('#unitPerformanceCalendar').fullCalendar({
        slotDuration: '00:15:00', /* If we want to split day time each 15minutes */
        //minTime: '08:00:00',
        //maxTime: '19:00:00',
        defaultView: 'month',
        defaultDate: new Date(),
        handleWindowResize: true,
        height: $(window).height(),
        header: {
            left: 'prev,next today',
            center: 'title',
            right: ''
        },
        eventSources: [
            {
                url: APIPATH,
                type:'POST',
                data:function() { return {
                    token:user.token,
                    method:'getListingCalendar',
                    listingId:Vector.selectedListingId
                };
                },
                color:'transparent',
                textColor:'#ccc'
            },
            {
                url: APIPATH,
                type:'POST',
                data:function() { return {
                    token: user.token,
                    method: 'getListingReservations',
                    listingId: Vector.selectedListingId
                };
                },
                textColor:'#fff',
                className:'bg-success'
            },
        ],
        editable: false,
        droppable: false, // this allows things to be dropped onto the calendar !!!
        eventLimit: false, // allow "more" link when too many events
        selectable: true,
        //drop: function(date) { $this.onDrop($(this), date); },
        //select: function (start, end, allDay) { alert('test'); },
        eventClick: Vector.clickUnitPerformanceCalendarEvent,
        viewRender: function(view,element) {
            var newstartdate = view.start.clone();
            newstartdate.add(view.end.diff(view.start,'days')/2,'days');
            Vector.startDateFilter=newstartdate.clone();
            Vector.startDateFilter.startOf('month');
            Vector.endDateFilter = newstartdate.clone();
            Vector.endDateFilter.endOf('month');
            if(user.role != 'user') {
                $("#adminDateRange").data('daterangepicker').setStartDate(Vector.startDateFilter);
                $("#adminDateRange").data('daterangepicker').setEndDate(Vector.endDateFilter);
                Vector.adminDashboardNeedsUpdate=1;
            }
            Vector.getReservationData(); //updates the calendar summary data and refills the reservations to match new date range
        }
    });
}
var MONTHNAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
var m = moment();
var ranges = {
    "Last 7 Days": [
        moment().subtract(7,"days"),
        moment()
    ],
    "Last 30 Days": [
        moment().subtract(30,"days"),
        moment()
    ]
};
ranges["This year"] = [
    moment().startOf("year"),
    moment().endOf("year")
];

ranges["Past year"] = [
    moment().subtract(12, "months").startOf("year"),
    moment().subtract(12, "months").endOf("year")
];
var monthranges = {};
for(var i=1; i<13; i++) {
    var startdate = m.clone().subtract(6-i,"month").startOf("month");
    var range = [startdate,startdate.clone().endOf('month')];
    var label = range[0].format("YYYY-MMMM");
    monthranges[label]=range;
}

var lastMonth = m.clone().subtract(1,"month");
ranges[lastMonth.format("MMMM")]= [
    lastMonth.clone().startOf("month"),
    lastMonth.clone().endOf("month")
];

ranges[m.format("MMMM")]= [
    m.clone().startOf("month"),
    m.clone().endOf("month")
];

var nextMonth =  m.clone().add(1,"month");
ranges[nextMonth.format("MMMM")]= [
    nextMonth.clone().startOf("month"),
    nextMonth.clone().endOf("month")
];

ranges["4 Month View"] = [
    m.clone().subtract(2,"months").startOf("month"),
    m.clone().add(1,"month").endOf("month")
];

Vector = {
    'adminDashboard':{},
    'selectedFilters':{},
    'selectedUserId':'',
    'selectedListingId':'',
    'airbnb_threads':[],
    'currentComps':[], //the comps for a selected/active listing
    'needToRefreshCompAnalytics': true,
    'needToRefreshCompList': true,
    'loadAdmin': function () {
        api({}, function (response) {
            $.extend(Vector,response);
            window.bnbTrackerUserId = Vector.adminDashboard.bnbTrackerUserId;
            mixpanel.identify(window.bnbTrackerUserId);
            if(Vector.adminDashboard.is_owner_portal!='1') {
                $(".owner-portal").remove();
            }
            if(Vector.customLogo) {
                $(".logoimg").attr("src",Vector.customLogo);
            }
            Vector.generateUserFilter();
            Vector.selectUser(user.user_id);
            $(".adminOnly").show();
            if(Vector.adminDashboard.godmode) {
                $(".godmodeOnly").show();
            }
            Vector.setupTags(response.listings);

            Vector.generateUsersTable();
            Vector.generateListingsTable();
            Vector.generateCityFilter();
            Vector.resetUnitFilter(Vector.listings);

            Vector.showAdminDashboard();
            Vector.fillListingSelect(response.listings);

            $("#side-menu-admindashboard a").addClass("subdrop");
            $("#adminDateRange").daterangepicker({
                    startDate: ranges[moment().format("MMMM")][0],
                    endDate: ranges[moment().format("MMMM")][1],
                    ranges: ranges,
                    alwaysShowCalendars: false
                }, function(start, end, label) {
                    Vector.refreshDateRangeOnCurrentView();
                }
            );
            var ref = '/'+app_configs.projectId+'/airbnb/threads';
            if(db) db.ref(ref).orderByChild('user_thread_updated_at').limitToFirst(10).on('child_added',function(ss) {
                Vector.airbnb_threads.push(ss.val());
                Vector.updateAirBnbThreads();
                $(".airbnbOnly").show();
            });
            Vector.syncBnbTrackerProperties();
        });
    },
    'isAdmin': function() {
        if(user.role=='god' || user.role=='admin' || user.role=='superadmin') return true;
        return false;
    },
    'fillListingSelect': function(listings) {
        var listingCount=0;
        var html="";
        for(var i in listings) {
            listingCount++;
            html+="<option class='listing listing_"+i+"' value='"+i+"'>"+listings[i].nickname||listings[i].title+"</option>";
        }
        $(".listingSelect").html(html);
        $(".activeListingsCount").html(listingCount);
    },
    'getPostsHTML': function(threadId) {
        var posts;
        for(var i in Vector.airbnb_threads) {
            if(Vector.airbnb_threads[i].id==threadId) {
                posts=Vector.airbnb_threads[i].posts;
            }
        }
        var html;
        for(var i in posts) {
            html+="<div class='row'><div class='card-box' style='margin-top:2px;'><span style='color:#aaa; top-margin:-5px;'>"+moment(posts[i].created_at).format('LLLL')+"</span><br/>"+posts[i].message+"</div></div>";
        }
        html+="<div class='row'><div class='card-box col-sm-8'><textarea class='form-control' rows='5' placeholder='Type your message'></textarea><br/>"+
            "<button class='btn btn-default waves-effect waves-light pull-right'>Send</button>"+
            "</div></div>";
        $("#ThreadComments").html(html);
    },

    'filterOnSliders': function(o) {
        var o = $("#priceSlider").slider('getValue');
        var minPrice = o[0];
        var maxPrice = o[1];
        var v = $("#occupancySlider").slider('getValue');
        var minOcc = v[0];
        var maxOcc = v[1];
        for(var i in currentComps) {
            var comp_price = parseFloat(currentComps[i].price);
            var comp_occ = parseFloat(currentComps[i].lastmonthocc);
            if (comp_price < minPrice || comp_price > maxPrice || comp_occ < minOcc || comp_occ > maxOcc) {
                // $("#listingSmallComp"+currentComps[i].id).hide();
                if (currentCompElements[currentComps[i].id])
                    currentCompElements[currentComps[i].id].mapmarker.setMap(null);
            } else {
                //  $("#listingSmallComp" + currentComps[i].id).show();
                if (currentCompElements[currentComps[i].id] &&
                    currentCompElements[currentComps[i].id].mapmarker.getMap()==null)
                    currentCompElements[currentComps[i].id].mapmarker.setMap(compmap);
            }
        }
        Vector.updateMapCount();
    },
    'updateMapCount':function() {
        var bounds = compmap.getBounds();
        var count = 0;
        for(var i in compmapmarkers) {
            if(bounds.contains(compmapmarkers[i].position) && compmapmarkers[i].getMap() == compmap) {
                count++;
                $("#listingSmallComp"+compmapmarkers[i].listingID).show();
                //$("#listingTiny"+compmapmarkers[i].listingID).show();
            }
            else {
                $("#listingSmallComp"+compmapmarkers[i].listingID).hide();
                //$("#listingTiny"+compmapmarkers[i].listingID).hide();
            }
        }
        $("#compSelectorResultCount").html(count);
    },
    'getSelectedComps': function(cb) {
            bnbtrackerapi({id:Vector.listings[Vector.selectedListingId].airbnb_id, user_id:user.user_id}, function(response) {
                selectedComps = response;
                if(cb) cb();
            });
    },
    'syncBnbTrackerProperties': function() {
        var seconds_delay=0;
        bnbtrackerapi({
            method: 'getProperties',
        },function(response) {
          //  console.log('got properties from bnbtracker',response);
            Vector.bnbtrackerProperties = response;
            for(var i in Vector.listings) {
                if(Vector.listings[i].isListed=='0' || Vector.listings[i].active=='0') continue;
                var found=0;
                for(var j in response) {
                    if(Vector.listings[i].airbnb_id == response[j].id) found=1;
                }
                if(!found) {
                    setTimeout(
                    bnbtrackerapi({
                            method:'addProperty',
                            id: Vector.listings[i].airbnb_id
                        },function(prop) {
                         //   console.log("Added property to bnbtracker:",prop);
                            Vector.bnbtrackerProperties.push(prop);
                        },1),
                        seconds_delay);
                    seconds_delay+=10000;
                }
            }
        });
    },
    'getCompList': function(listing,callback) {
        var addCompsTagsInput = $('input#airbnbIds');
        addCompsTagsInput.on('beforeItemAdd', function (event) {
            // allow to add multiple IDs at once, separated by a space
            var items = event.item.split(' ');
            if (items.length > 1) {
                event.cancel = true;
                items.forEach(function (id) {
                    addCompsTagsInput.tagsinput('add', id);
                });
            }

        });
        $("#compList").html("<div class='uil-default-css' style='transform:scale(0.6);'><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(0deg) translate(0,-60px);transform:rotate(0deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(30deg) translate(0,-60px);transform:rotate(30deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(60deg) translate(0,-60px);transform:rotate(60deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(90deg) translate(0,-60px);transform:rotate(90deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(120deg) translate(0,-60px);transform:rotate(120deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(150deg) translate(0,-60px);transform:rotate(150deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(180deg) translate(0,-60px);transform:rotate(180deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(210deg) translate(0,-60px);transform:rotate(210deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(240deg) translate(0,-60px);transform:rotate(240deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(270deg) translate(0,-60px);transform:rotate(270deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(300deg) translate(0,-60px);transform:rotate(300deg) translate(0,-60px);border-radius:10px;position:absolute;'></div><div style='top:60px;left:95px;width:10px;height:80px;background:#19939a;-webkit-transform:rotate(330deg) translate(0,-60px);transform:rotate(330deg) translate(0,-60px);border-radius:10px;position:absolute;'></div></div>");
        $("#selectedCompList").html("<div style='line-height:80px; width:100%; text-align:center; font-size:40px;'>Selected Comparables</div>");
        selectedProperty=listing;
        $("#bathroomsCompSelectorFilter").val(listing.bathrooms);
        $("#bedroomsCompSelectorFilter").val(Math.floor(parseFloat(listing.bedrooms)));
        $("#bedroomsCompSelectorFilter").selectpicker('refresh');
        $("#bathroomsCompSelectorFilter").selectpicker('refresh');
        compmapmarkers=[];

        bnbtrackerapi({id:listing.id,room_type:listing.room_type,reviews:$("#reviewsCompSelectorFilter").val(),guests:$("#guestsCompSelectorFilter").val(),lat:listing.lat,lng:listing.lng,bedrooms:listing.bedrooms,bathrooms: $("#bathroomsCompSelectorFilter").val(),city:listing.city,state:listing.state},
            function(response) {
              //  console.log(response);
                currentComps = response.listings;
                currentCompElements = [];
                initCompMap(new google.maps.LatLng(listing.lat,listing.lng));

                var minPrice=10000000;
                var maxPrice=0;

                var m = new google.maps.Marker({
                    position: new google.maps.LatLng(listing.lat,listing.lng),
                    map:compmap,
                    animation: google.maps.Animation.BOUNCE,
                    icon: 'images/mapIconProperty.png',
                    title: (listing.nickname || listing.title)
                });

                drawSelectedCompList(response.selectedComps);
                $("#compList").html("");
                $("#compSelectorResultCount").html(Object.keys(response.listings).length);
                listingloop:
                    for(var i in response.listings) {
                        for(var j in response.selectedComps) {
                            if(response.listings[i].id == response.selectedComps[j].id) continue listingloop;
                        }
                        var comp = response.listings[i];
                        var l = $("#listingSmall").clone();
                        currentCompElements[comp.id] = l;
                        l.attr("id","listingSmallComp"+comp.id);
                        if(parseFloat(comp.price) > maxPrice) {
                            maxPrice = parseFloat(comp.price);
                        }
                        if(parseFloat(comp.price) < minPrice) {
                            minPrice = parseFloat(comp.price);
                        }
                        (function(l,comp,listing) {
                            l.find(".listingName").click(function(evt) {
                                evt.stopPropagation();
                                evt.preventDefault();
                                evt.stopImmediatePropagation();
                                window.open("http://www.airbnb.com/rooms/"+comp.id);
                            });

                            l.click(function(evt) {
                                evt.stopPropagation();
                                evt.preventDefault();
                                evt.stopImmediatePropagation();
                                if(l.parent().attr("id")!="compList") {
                                    l.detach().appendTo("#compList");
                                    l.find(".squaredTwoInput").attr("checked",false);
                                    l.mapmarker.setIcon(getMapIconFromPrice(comp.price));
                                    l.removeClass("selectedComp");
                                    $("#listingTiny"+comp.id).remove();
                                    $("#listingFloat"+comp.id).remove();
                                    unselectCompForListing(comp, listing);
                                } else {
                                    //l.detach().appendTo("#selectedCompList");
                                    l.find(".squaredTwoInput").attr("checked",true);
                                    l.mapmarker.setIcon(getMapIconFromPrice(comp.price,'s'));
                                    l.addClass("selectedComp");
                                    l.detach();
                                    addListingElementToSelectedComps(l, comp);
                                    selectCompForListing(comp, listing);
                                }

                            });

                            if('thumbnail_urls' in comp) {
                                l.hover(function (evt) {
                                    l.find(".hoverArrow").show();
                                    l.find(".squaredTwo label").addClass("hoverclass");
                                }, function (evt) {
                                    l.find(".hoverArrow").hide();
                                    l.find(".squaredTwo label").removeClass("hoverclass");
                                });
                                l.find(".hoverArrow").click(function (evt) {
                                    evt.stopPropagation();
                                    evt.preventDefault();
                                    evt.stopImmediatePropagation();
                                    if (!$(this).parent().data("imgindex")) $(this).parent().data("imgindex", 0);
                                    if ($(this).hasClass("hoverArrowRight")) { //move right
                                        var newIndex = $(this).parent().data("imgindex")+1;
                                        if(newIndex>=comp.thumbnail_urls.length) newIndex=0;
                                        $(this).parent().data("imgindex",newIndex);
                                        l.find(".listingThumb").attr("src",comp.thumbnail_urls[newIndex]);
                                    }
                                    else { //move left
                                        var newIndex = $(this).parent().data("imgindex")-1;
                                        if(newIndex<0) newIndex=comp.thumbnail_urls.length-1;
                                        $(this).parent().data("imgindex",newIndex);
                                        l.find(".listingThumb").attr("src",comp.thumbnail_urls[newIndex]);
                                    }
                                });
                            }
                        })(l,comp,listing);
                        l.find(".listingThumb").attr("src",comp.thumbnail_url);
                        l.find(".listingName").html(comp.name);
                        l.find(".listingPrice").html("$"+comp.price);
                        l.find(".listingPropertyType").html(comp.property_type);
                        l.find(".squaredTwoInput").attr("id","squaredTwoComp"+comp.id);
                        l.find("label").attr("for","squaredTwoComp"+comp.id);

                        l.find(".listingBathrooms").html(parseInt(comp.bathrooms));
                        l.find(".listingBedrooms").html(parseInt(comp.bedrooms));
                        l.find(".listingBeds").html(parseInt(comp.beds));
                        l.find(".listingGuests").html(comp.person_capacity);
                        if(comp.star_rating) l.find(".listingStars").html(Array(parseInt(comp.star_rating)+1).join("<i class='fa fa-star' style='margin-right:2px;'></i>"));
                        l.find(".listingReviews").html("<i class='fa fa-comment' aria-hidden='true'></i><div>"+comp.reviews_count+"</div>");

                        l.css("display","block");
                        $("#compList").append(l);

                        l.mapmarker = new google.maps.Marker({
                            position: new google.maps.LatLng(comp.lat,comp.lng),
                            map:compmap,
                            icon: getMapIconFromPrice(comp.price),
                            title: comp.name
                        });
                        compmapmarkers.push(l.mapmarker);

                        (function(comp,listing,l) {
                            var m = l.mapmarker;
                            m.listingID = comp.id;
                            var infowindow = new google.maps.InfoWindow();
                            infowindow.setContent(comp.name);
                            l.infowindow = infowindow;
                            m.addListener("click",function() {
                                $("#listingSmallComp"+comp.id).parent()[0].scrollTop=
                                    parseFloat($("#listingSmallComp"+comp.id)[0].offsetTop)-parseFloat($("#listingSmallComp"+comp.id).parent()[0].offsetTop);
                            });
                            m.addListener("mouseover",function() {
                              //  infowindow.open(compmap,m);
                                $("#listingSmallComp"+comp.id).css("border","2px solid #6ec2e1");
                            });
                            m.addListener("mouseout",function() {
                              //  infowindow.close();
                                $("#listingSmallComp"+comp.id).css("border","none");
                            });

                            l.hover(function() {
                                l.mapmarker.setZIndex(google.maps.Marker.MAX_ZINDEX + 1);
                                l.mapmarker.setAnimation(google.maps.Animation.BOUNCE);
                              //  infowindow.open(compmap, m);
                            },function() {
                              //  infowindow.close();
                                l.mapmarker.setAnimation(null);
                            });

                        })(comp,listing,l);

                    }
                compmapmarkers.sort(function(a,b) {
                    return google.maps.geometry.spherical.computeDistanceBetween(a.position, m.position) -
                        google.maps.geometry.spherical.computeDistanceBetween(b.position, m.position);
                });
                var b =  new google.maps.LatLngBounds();
                for(var i=0; i<compmapmarkers.length && i<50; i++) {
                    b.extend(compmapmarkers[i].position);
                }

                compmap.setCenter(b.getCenter());
                compmap.fitBounds(b);

                $("#priceSlider").slider({
                    id: "priceSliderComponent",
                    range: true,
                    value: [minPrice, maxPrice],
                    ticks: [0,30,300,500,1000,20000],
                    ticks_positions: [0,10,50,80,90,100],
                    ticks_labels: ["0","$30","$300","$500","$1000","$20000"],
                    tooltip_position: "bottom"

                });
                $("#priceSliderComponent").on("slideStop", Vector.filterOnSliders);
                Vector.applyCompSelectorFilters = function() {
                    listing.bedrooms = $("#bedroomsCompSelectorFilter").val();
                    listing.bathrooms = $("#bathroomsCompSelectorFilter").val();
                    Vector.getCompList(listing);
                }
                Vector.needToRefreshCompList=false;
                if(callback) callback();
            },1);
    },
'updateCompMapZoom': function() {
    var listener = setInterval(function() {
        if (compmap && compmap.getZoom() != 12) {
            compmap.setZoom(12);
            clearInterval(listener);
        }
    },300);
},
'getThreadHTML': function(t) {
        var timedifference = moment(t.last_message_at).diff(moment(),'minutes');
        html="<div class='row ThreadPreview btn' onclick='Vector.getPostsHTML("+t.id+");'>"+
            "<img src='"+t.other_user.picture_url+"'>"+
            "<span class='threadguestname'>"+t.other_user.first_name+"</span>"+
            "<span class='threadlistingname'>"+t.inquiry_listing.name+"</span>"+
            "<span class='timeago'>"+timedifference+"m ago<br/></span>"+
            "</div>";
        return html;
    },
    'showAdminThreads': function() {
        $(".rightContent").hide();
        var html="";
        for(var i in Vector.airbnb_threads) {
            html+=Vector.getThreadHTML(Vector.airbnb_threads[i]);
        }
        $("#Threads").html(html);
        $("#adminThreads").show();
    },
    'updateAirBnbThreads':function() {
        $(".messageCount").html(Vector.airbnb_threads.length);
    },

    'refreshDateRangeOnCurrentView':function() {
        Vector.startDateFilter=$("#adminDateRange").data("daterangepicker").startDate;
        Vector.endDateFilter=$("#adminDateRange").data("daterangepicker").endDate;
        if($("#adminOccupancy").is(":visible")) {
            api({method:'getAdminDashboard'},function(response) {
                Vector.adminDashboard = response;
                Vector.showAdminOccupancy();
                Vector.generateOccupancyLookaheadTable(Vector.adminDashboard.occupancyLookahead);
                Vector.generateOccupancyVsCompAvgTable();
            });
        } else if($("#adminHospitality").is(":visible")) {
            Vector.showAdminHospitality();
        } else if($("#adminAnalytics").is(":visible")) {
            Vector.showAdminAnalytics();
        } else if($("#adminReviews").is(":visible")) {
            Vector.showAdminReviews();
        } else if($("#adminReservations").is(":visible")) {
            Vector.showAdminReservations();
        } else if($("#adminScorecard").is(":visible")) {
            Vector.showAdminScorecard();
        } else {
            Vector.getAdminDashboard();
        }
    },
    'setupTags': function(listings) {
        Vector.tags={};
        for(var i in listings) {
            if(listings[i].tags) {
                var a = listings[i].tags.split(',');
                a.forEach(function (e) {
                    if (e != '')
                        Vector.tags[e] = true;
                });
            }
            if(listings[i].tagsLocal) {
                a = listings[i].tagsLocal.split(',');
                a.forEach(function (e) {
                    if (e != '')
                        Vector.tags[e] = true;
                });
            }
        }
        Vector.tags = Object.keys(Vector.tags).sort();
    },
    'loadUser': function(cb) {
        if(!$("#userDateRange").data("daterangepicker")) {
            Vector.startDateFilter=moment().startOf('month');
            Vector.endDateFilter=moment().endOf('month');
            $("#userDateRange").daterangepicker({
                    startDate: monthranges[moment().format("YYYY-MMMM")][0],
                    endDate: monthranges[moment().format("YYYY-MMMM")][1],
                    ranges: monthranges,
                    showCustomRangeLabel: false
                }, function (start, end, label) {
                    Vector.startDateFilter=start;
                    Vector.endDateFilter=end;
                    Vector.loadUser(cb);

                }
            );

            $("#userDateRange").on('apply.daterangepicker cancel.daterangepicker hide.daterangepicker', function(ev, picker) {
                $(this).val(picker.startDate.format('YYYY-MMMM'));
            });
            $("#userDateRange").val(moment().format("YYYY-MMMM"));
        }

        var currentSelections=$("#unitFilterSelect").val();

        api({}, function (response) {
            Vector.dashboardData=response;
            Vector.listings = response.listings;
            Vector.setupTags(response.listings);

            $("#activeListingsCount").html(response.listings.length);


            Vector.fillListingSelect(response.listings); //for listing page
            Vector.resetUnitFilter(response.listings, currentSelections); //for the top filter styled like admin
            $("#unitFilterSelect").selectpicker("refresh");


            Vector.generateUserListingTable();
            Vector.generateMonthlyDashboard();
            Vector.generateUserLastYearRevenue();

            Vector.showUserDashboard();

            if(cb) {
                cb();
                return;
            }
        });
    },

    'displayIntegrationsInputs': function (select) {
        $("#newIntegrationKey").val(''),
        $("#newIntegrationSecret").val('');
        if ($(select).val().toLowerCase() == 'pricelabs') {
            $("#newIntegrationSecret").hide();
        } else {
            $("#newIntegrationSecret").show();
        }
    },

    'addNewIntegration': function() {
        api({
            integrationType:$("#newIntegrationType").val(),
            integrationKey:$("#newIntegrationKey").val(),
            integrationSecret:$("#newIntegrationSecret").val()
        },function(response) {
            Vector.integrations = response.integrations;
            $("#newIntegrationSecret").show();
            $("#newIntegrationType").prop('selectedIndex', 0);
            $("#newIntegrationKey").val(''),
            Vector.showAdminSettings();
        });
    },
    'deleteIntegration': function(id) {
        api({integrationId:id}, function(response) {
            Vector.integrations = response.integrations;
            Vector.showAdminSettings();
        });
    },

    'deleteDomain': function(id) {
        api({id:id}, function(response) {
            Vector.adminDashboard.domains = response.domains;
            Vector.showGodmodeDomains();
        });
    },

    'showEditDomainForm': function(id) {
        $('#editDomain').show();
        $('#newDomain').hide();

        var domain = Vector.adminDashboard.domains.filter(function(domain) {
            return domain.id == id;
        }).shift();

        var form = $('#editDomain').find('form');
        form.find('button').attr('onClick','Vector.saveDomain(' + id + ')');

        var email = form.find('input#editDomainEmail');
        var isOwnerPortal = form.find('input#editDomainOwnerPortal');

        email.val(domain.email);
        isOwnerPortal.val(domain.is_owner_portal);

    },

    'saveDomain': function (id) {
        api({
            domainId: id,
            email: $('#editDomainEmail').val(),
            isOwnerPortal: $('#editDomainOwnerPortal')[0].checked
        }, function(response) {
            Vector.adminDashboard.domains = response.domains;
            Vector.showGodmodeDomains();
        });
    },

    'addDomain': function() {
        api({
            name: $('#newDomainName').val(),
            username: $('#newDomainUsername').val(),
            password: $('#newDomainPassword').val(),
            email: $('#newDomainEmail').val(),
            isOwnerPortal: $('#newDomainOwnerPortal')[0].checked
        }, function(response) {
            Vector.adminDashboard.domains = response.domains;
            Vector.showGodmodeDomains();
        });
    },

    'showGodmodeDomains': function() {
        $(".rightContent").hide();
        $("#editDomain").hide();
        if ($("#newDomain").is(":hidden")) {
            $("#newDomain").show();
        }

        $("#godmodeDomainsTable").html("<h4 class='m-t-0 header-title'>Domains</h4><table class='p-1 table w-100'></table>");
        var domainsTable = $("#godmodeDomainsTable").find("table");
        domainsTable.on("draw.dt", function (){
            setTimeout(function () {
                $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
            }, 200);
            }).DataTable({
            sScrollX: "100%",
            sScrollXInner: "110%",
            bScrollCollapse: true,
            data:Vector.adminDashboard.domains,
            columns: [
                {
                    data: "id", title:"Action", "render": function (data, type, row) {
                        var deleteButton = "<i class='ion-close-circled btn' onClick='if(confirm(\"Are you sure you want to delete this domain?\")) Vector.deleteDomain(\""+data+"\");'></i>";
                        var editButton = "<i class='ion-edit btn' onClick='Vector.showEditDomainForm(\""+data+"\");'></i>";
                        if (type === 'display') {
                            return deleteButton + editButton;
                        }
                    }
                },
                {data: "name",title:"Name"},
                {data: "email",title:"Email"},
                {
                    data: "createdOn", title:"Created On", "render": function (data, type, row) {
                        if (type === 'display' && data === null) {
                            return 'n/a';
                        }
                        return data;
                        }
                },
                {
                    data: "is_owner_portal", title:"Owner Portal", "render":  function (data, type, row) {
                        return data == 1 ? 'Yes' : 'No';
                    }
                },
                {
                    data: "subscriptionDate", title:"Subscription Date", "render": function (data, type, row) {
                        if (type === 'display' && data === null) {
                            return 'n/a';
                        }
                        return data;
                    }
                }
            ]
        });

        $("#godmodeDomains").show();
    },

    'showUserSettings': function () {
        $(".rightContent").hide();
        if (!user.hasOwnProperty('currency') || !user.hasOwnProperty('email')) {
            alert('You must log out the system and then log in again for only this time in order to use this feature.');
        }
        var form = $("form.userProfileForm");
        form.find("h5.username").text(user.username);
        form.find("input[name='userFullname']").val(user.fullname);
        form.find("input[name='userEmail']").val(user.email);

        $("#userCurrencySelect option[value='"+ user.currency +"']").prop('selected', true)

        $("#userSettings").show();
    },

    'updateUsersProfile': function (userId) {
        var form = $("form.userProfileForm");
        var password = form.find("input[name='userPassword']").val()
        var data = {
            id: userId,
            fullname: form.find("input[name='userFullname']").val(),
            email: form.find("input[name='userEmail']").val(),
            currency: $('#userCurrencySelect').val()
        };

        if ( password !== '') {
            data['password'] = password
        }

        api(data, function (response) {
            window.user = response.user;
            localStorage.removeItem('user');
            localStorage.setItem('user',JSON.stringify(response.user));
            window.location.reload();
        })
    },

    'showAdminSettings': function() {
        $(".rightContent").hide();

        $("#integrationsTable").html("<table class='p-1 table w-100'></table>");
        $("#integrationsTable").find("table").DataTable({
            data:Vector.integrations,
            bFilter: false,
            bInfo: false,
            paging:false,
            columns: [
                {data: "_id",title: "Action",  "render": function ( data, type, row, meta ) {
                    return "<i class='ion-close-circled btn' onClick='if(confirm(\"Are you sure you want to delete this integration?\")) Vector.deleteIntegration(\""+ data +"\");'></i>";
                  }
                },
                {data: "type",title:"Type"},
                {data: "username",title:"Key"},
                {data: "password",title:"Secret"}
            ]
        });

        if (Vector.customLogo) {
            $('.deleteLogo').show();
        }
        $("#adminSettings").show();
    },

    'saveLogo': function (event) {
        var logoForm = $(event.target);
        var logo = logoForm.find('input[type="file"]').prop('files')[0];
        var formData = new FormData();
        formData.append('logo', logo);
        formData.append('method', 'saveLogo');

        $.ajaxSetup({
            processData: false,
            contentType: false
        });

        api(formData, function (response) {
            $('.logoUploadAlert').html(response.msg).show().fadeOut(5000);
            event.target.reset();
        });
    },

    'deleteLogo': function (event) {
        var button = $(event.target);
        api({path: Vector.customLogo}, function (response) {
            $('.logoUploadAlert').html(response.msg).show().fadeOut(5000);
            button.hide();
            Vector.customLogo = '';
        })
    },

    'updateAllChartFilters':function() {
        $(".filtertaglist").tagsinput('removeAll');
        for( var type in Vector.selectedFilters) {
            Vector.selectedFilters[type].forEach(function(f) {
                $(".filtertaglist").tagsinput('add',type+':'+f);
            });
        }
    },

    'getAdminDashboard': function() {
        api({},function(response) {
            Vector.adminDashboard=response;
            Vector.showAdminDashboard();

            Vector.updateAllChartFilters();
        })
    },

    'setFilters': function(filters,type) {
        if(type=='unit' && filters=='') {
            delete(Vector.selectedFilters['tagsLocal']);
        }
        if(type=='city') {
            delete(Vector.selectedFilters['tag']);
            delete(Vector.selectedFilters['unit']);
            delete(Vector.selectedFilters['bedroom']);
            delete(Vector.selectedFilters['tagsLocal']);
        }
        delete(Vector.selectedFilters[type]);
        if(!filters || filters=='') {
            filters=[];
        }

        //if a tagsLocal filter is present, select all the relevant units and deselect the tagsLocal
        var foundTagsLocal=false;
        for(var i in filters) {
            if (filters[i].indexOf('tagsLocal:')>=0) {
                var localTag = filters[i].substring(10);
                foundTagsLocal=true;
                var newfilters = [];
                for(var j in Vector.listings) {
                    if (Vector.listings[j].tagsLocal && Vector.listings[j].tagsLocal.split(',').indexOf(localTag)>=0)
                    {
                        newfilters.push("unit:"+j);
                    }
                }
                filters = newfilters;
                $("#unitFilterSelect").val(filters);
                $('#unitFilterSelect').selectpicker('render');
                break;
            }
        }

        filters.forEach(function(f) {
            if(f.indexOf(type+':')>=0) {
                if(!(type in Vector.selectedFilters)) Vector.selectedFilters[type]=[];
                Vector.selectedFilters[type].push(f.replace(type + ':', ''));
            } else {
                var a = f.split(':');
                if(!(a[0] in Vector.selectedFilters)) Vector.selectedFilters[a[0]]=[];
                Vector.selectedFilters[a[0]].push(a[1]);
            }
        });

        if(type=='city') { // change the displayed unit and bedroom filter
            if (filters.length == 0) {
                Vector.resetUnitFilter(Vector.listings);
                $("#unitFilterSelect").selectpicker("refresh");
            } else {
                Vector.generateUnitFilter(Vector.listings);
                Vector.generateBedroomFilter();
            }
        }
    },

    'toggleGraphSettings': function(graph) {
        graph.find('.settings').toggle();
    },
    'toggleGraphSize': function(graph) {
      if(graph.hasClass('col-sm-6'))  {
          graph.removeClass('col-sm-6').addClass('col-sm-12');
          graph.find('.md-fullscreen').removeClass('md-fullscreen').addClass('md-unfold-less');
      } else {
          graph.removeClass('col-sm-12').addClass('col-sm-6');
          graph.find('.md-unfold-less').removeClass('md-unfold-less').addClass('md-fullscreen');
      }
    },
    'generateCityFilter': function() { //this should only ever run once
        var html="";
        for(var i in Vector.cities) {
            html+="<option class='city city_"+Vector.cities[i].name.replace(' ','')+"' value='city:"+Vector.cities[i].name+"'>"+Vector.cities[i].name+"</option>";
        }

        Vector.tags.forEach(function(t) {
            html+="<option class='city city_"+t.replace(' ','')+"' value='tag:"+t+"'>#"+t+"</option>";
        });

        $("#cityFilterSelect").html(html);
        $("#cityFilterSelect").select2();
    },

    'deleteUnitGroup': function(tag) {
        api({tag:tag},function() {
            Vector.tags.splice(Vector.tags.indexOf(tag),1);
            for(var i in Vector.listings) {
                var listing = Vector.listings[i];
                if(!listing.tagsLocal) continue;
                var tagsLocal = listing.tagsLocal.split(",");
                var index = tagsLocal.indexOf(tag);
                if(index>-1) {
                    tagsLocal.splice(index,1);
                    listing.tagsLocal = tagsLocal.join();
                }
            }
            Vector.setupTags(Vector.listings);
            Vector.fillListingSelect(Vector.listings); //for listing page
            Vector.resetUnitFilter(Vector.listings,$("#unitFilterSelect").val());
            $("#unitFilterSelect").selectpicker("refresh");
            $('#unitFilterSelect').selectpicker('render');

            $("#tagManagementModal").modal('hide');
        });
    },

    'showTagManagementModal': function() {
        var html="";
        var tagsLocal = [];
        for(var i in Vector.listings) {
            var listing = Vector.listings[i];
            if(listing.tagsLocal) {
                listing.tagsLocal.split(',').forEach(function(tag) {
                    if(!(tag in tagsLocal)) {
                        tagsLocal[tag]=1;
                        html+="<button class='m-2' onclick='Vector.deleteUnitGroup(\""+tag+"\");'>"+tag+" X</button>";
                    }
                });
            }
        }
        $("#existingCustomTags").html(html);
        $("#tagManagementModal").modal();
    },

    'saveUnitGroup': function() {
        var newTagLocal = prompt('What would you like to name the new #group?');
        if(!newTagLocal) return;
        if (newTagLocal.charAt(0)=='#') {
            newTagLocal=newTagLocal.substring(1);
        }
        api({
            listings: Vector.selectedFilters.unit,
            newTagLocal: newTagLocal
        },function(response) {
            if(!('tagsLocal' in Vector.selectedFilters)) Vector.selectedFilters.tagsLocal = [];
            for(var i in Vector.listings) {
                if(Vector.selectedFilters.unit && Vector.selectedFilters.unit.indexOf(i)>=0) {
                    if (!('tagsLocal' in Vector.listings[i]) || !Vector.listings[i].tagsLocal) {
                        Vector.listings[i].tagsLocal = newTagLocal;
                    } else {
                        Vector.listings[i].tagsLocal+=(","+newTagLocal);
                    }

                }
            }
            Vector.setupTags(Vector.listings);
            Vector.resetUnitFilter(Vector.listings,$("#unitFilterSelect").val());
            $('#unitFilterSelect').selectpicker('refresh');
            $('#unitFilterSelect').selectpicker('render');
            $("#tagManagementModal").modal('hide');
        });
    },

    'resetUnitFilter': function (listings, currentSelections) {
        html='';
        var listingtagslocal = [];
        var isselected;
        for(var lf in listings) {
            if(listings[lf].tagsLocal)
            {
                var tagslocal = listings[lf].tagsLocal.split(",");
                for(var i in tagslocal) {
                    listingtagslocal[tagslocal[i]] = true;
                }
            }
        }

        for(var tag in listingtagslocal) {
            isselected=false;
            if (Vector.selectedFilters.tagsLocal && Vector.selectedFilters.tagsLocal.indexOf(tag) >= 0)
                isselected=true;
            html += "<option " + (isselected ? 'selected' : '') + " class='dropdown-item unit' value='tagsLocal:" + tag + "'>##" +  tag + "</a>";
        }

        for(var lf in listings) {
            var isselected=false;
            if(currentSelections) {
                if(-1!=currentSelections.indexOf('unit:'+lf)) {
                    isselected=true;
                }
            }
            html+="<option "+(isselected?'selected':'')+" class='dropdown-item unit unit_'"+listings[lf]._id + " value='unit:"+listings[lf]._id+"'>"+listings[lf].nickname+"</a>";
        };
        $("#unitFilterSelect").html(html);
        $("#unitFilterSelect").selectpicker({noneSelectedText: 'Unit selection'});

    },
    'generateBedroomFilter': function() {
        var bedrooms = [];
        var html = '';
        var cities = ('city' in Vector.selectedFilters) ? Vector.selectedFilters.city : [];
        Object.values(Vector.listings).forEach(function (l) {
            if (bedrooms.indexOf(l.bedrooms) === -1 && cities.indexOf(l.address_city) !== -1) {
                bedrooms.push(l.bedrooms);
            }
        });

        bedrooms.sort();

        bedrooms.forEach(function (number) {
            html += "<option class='bedroom bedroom_"+ number +"' value='bedroom:"+ number +"'>"+ number +"</option>";
        });

        $('#bedroomFilterSelect').html(html);
        $('#bedroomFilterSelect').select2();

        if(html=='')
            $("#bedroomFilterSelect").parent().addClass('invisible');
        else
            $("#bedroomFilterSelect").parent().removeClass('invisible');

    },
    'generateUnitFilter': function(listings) {
        var listingFilters=[];
        var currentSelections=$("#unitFilterSelect").val();


        if('city' in Vector.selectedFilters)
            Vector.selectedFilters['city'].forEach(function(c) {
                for(var l in listings) {
                    l=listings[l];
                    if(l.address_city==c)
                        listingFilters.push(l);
                }
            });

        if('tag' in Vector.selectedFilters)
            Vector.selectedFilters['tag'].forEach(function(c) {
                for(var l in listings) {
                    l=listings[l];
                    if(l.tags && l.tags.indexOf(c)>=0)
                        listingFilters.push(l);
                }
            });

        var selectedUnits=[];
        var html="";
        listingFilters.forEach(function(lf) {
            var isselected=false;
            if(-1!=currentSelections.indexOf('unit:'+lf._id)) {
                isselected=true;
                selectedUnits.push(lf._id);
            }
            html+="<option class='dropdown-item unit unit_'"+lf._id+"' "+
                (isselected?'selected':'') + " value='unit:"+lf._id+"'>"+lf.nickname||lf.title+"</a>";
        });
        if(selectedUnits.length>0) Vector.selectedFilters['unit']=selectedUnits;
        $("#unitFilterSelect").html(html);
        $("#unitFilterSelect").val('default');
        $("#unitFilterSelect").selectpicker("refresh");
    },

    'generateUserFilter': function(userid) { //this should only ever run once
        var html="<a class='dropdown-item user user_'>All Users</a>";
        for(var i in Vector.users) {
            html+="<a class='dropdown-item user user_"+i+"' onclick='Vector.selectUser("+i+")'>"+Vector.users[i].fullname+"</a>";
        }
        $("#userFilterGroup").html(html);
    },

    'resetColorIndex': function() {
        Vector.colorIndex=0;
    },

    'getColor':function(i){
        if(!'app_configs' in window) return {
            backgroundColor: "rgba(95, 190, 170, 0.3)",
            borderColor: "#5fbeaa",
            hoverBackgroundColor: "rgba(95, 190, 170, 0.6)",
            hoverBorderColor: "#000"
        };
        if(i==undefined) {
            i = Vector.colorIndex;
            Vector.colorIndex++;
        }
        var c = app_configs.colors[i];
        if(Vector.colorIndex>=app_configs.colors.length) Vector.colorIndex=0;
        return c;
    },

    'daysInRange': function(start,end,startlimit,endlimit) { //assume all moments
        if(start.isSameOrBefore(startlimit) && end.isAfter(startlimit) && end.isBefore(endlimit)) {
            return end.diff(startlimit, 'days');
        }
        if(start.isSameOrAfter(startlimit) && start.isSameOrBefore(endlimit) && end.isAfter(endlimit)) {
            return endlimit.diff(start,'days')+1;
        }
        if((start.isSameOrAfter(startlimit) && end.isSameOrBefore(endlimit))) {
            return end.diff(start,'days');
        }
        if (start.isBefore(startlimit) && end.isAfter(endlimit)) {
            return endlimit.diff(startlimit,'days')+1;
        }
        return 0;
    },

    'revInRange': function(rev, start, end, rangestart, rangeend) {
        var daysinrange =  Vector.daysInRange(start, end, rangestart, rangeend);
        return rev * daysinrange / ( end.diff(start, 'days') || 1 );
    },

    'getPdf': function() {
        api({}, function(response) {
            var link = document.createElement('a');
            document.body.appendChild(link);
            link.href = response.path;
            link.download = response.filename;
            link.click();
            document.body.removeChild(link);
        });

    },

    'adminExportUserMonthExcel': function() {
        api({}, function(response) {
            var link = document.createElement('a');
            document.body.appendChild(link);
            link.href = response.path;
            link.download = response.filename;
            link.click();
            document.body.removeChild(link);
        });
    },

    'exportUserMonth': function() {
        api({method:'getReservationData'},function(response) {
            var reservations=response.reservations;
            var filename="VectorStays_Export_"+ Vector.startDateFilter.format("YYYY-MMMM")+"_"+Date.now()+".csv";
            var monthname = Vector.startDateFilter.format("MMMM");
            var csv = "";
            var currentname="";
            var revgrandtotal = 0;
            var revtotal=0;
            var monthrev=0;
            var rev=0;
            var tempcsv='';
            for(var i in reservations) {
                var r = reservations[i];
                if(currentname!=r.nickname) {
                    if(revtotal>0) {
                        csv+="\n\nUnit:,"+currentname+"\n"+monthname+ " Revenue:,"+revtotal.toFixed(2)+",,,Owner Payout:,"+(revtotal*(1-user.commission)).toFixed(2)+"\n"+
                            "Name,Date Confirmed,Guests,Source,Status,Check In,Check Out,Revenue,"+monthname+" Revenue\n"+tempcsv;
                    }
                    revgrandtotal+=revtotal;
                    revtotal=0;
                    currentname=r.nickname;
                    tempcsv='';
                }
                rev = parseFloat(r.hostPayout) - parseFloat(r.fareCleaning);

                monthrev = Vector.revInRange(parseFloat(r.hostPayout) - parseFloat(r.fareCleaning),moment(r.checkIn),moment(r.checkOut),Vector.startDateFilter,Vector.endDateFilter);
                revtotal+=monthrev;
                tempcsv+=r.firstName+" "+r.lastName+","+r.confirmedAt+","+r.guestsCount+","+r.source+","+r.status+","+r.checkIn+","+r.checkOut+","+rev+","+monthrev+"\n";
            }
            revgrandtotal+=revtotal;
            csv+="\n\nUnit:,"+currentname+"\n"+monthname+" Revenue:,"+revtotal.toFixed(2)+",,,Owner Payout:,"+(revtotal*(1-user.commission)).toFixed(2)+"\n"+
            "Name,Date Confirmed,Guests,Source,Status,Check In,Check Out,Payout,"+monthname+" Revenue\r\n"+tempcsv;
            csv=Vector.startDateFilter.format("MMMM-YYYY")+"\r\n\r\n"+"Revenue:,"+revgrandtotal.toFixed(2)+",,,Owner Payout:,"+(revgrandtotal*(1-user.commission)).toFixed(2)+"\n\n"+csv;
            var encodedUri =encodeURI("data:text/csv;charset=utf-8,")+encodeURIComponent(csv);
            var link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", filename);
            link.innerHTML= "Click Here to download";
            document.body.appendChild(link); // Required for FF
            link.click();
            setTimeout(function() {$(link).remove()},5000);
        });
    },

    'generateSameMonthRevenue':function(options) {
        if(!options) options={};
        if(!('by' in options)) options.by = 'month';

        if('refresh' in options){
            api({method:'getSameMonthRevenue'},function(response) {
                Vector.adminDashboard.sameMonthRevenue = response.sameMonthRevenue;
                Vector.generateSameMonthRevenue();
            })
            return;
        }
        var sameMonthChart = {
            labels: [],
                datasets: [{
                    label: "Revenue",
                    data: [],
                }]
        };
        var totalRev=0;
        var rev=0;
        Object.assign(sameMonthChart.datasets[0],app_configs.colors[0]);
        var datepart='';
        var curdatepart;
        for(var i in Vector.adminDashboard.sameMonthRevenue) {
            var r = Vector.adminDashboard.sameMonthRevenue[i];
            switch(options.by) {
                case 'day':
                    curdatepart=moment(r.date).format("MM-DD");
                    break;
                case 'month':
                    //sum the month values until we encounter a new month value
                    curdatepart = moment(r.date).format("MMM");
                    break;
                case 'year':
                    curdatepart = moment(r.date).format("YYYY");
                    break;
            }
            if(datepart!=curdatepart) {
                datepart=curdatepart;
                sameMonthChart.labels.push(curdatepart);
                sameMonthChart.datasets[0].data.push(0);
            }
            rev =  parseFloat(r.rev);
            sameMonthChart.datasets[0].data[sameMonthChart.labels.length-1]+=rev;
            totalRev+=rev;
        }

        sameMonthChart.chartTitle='Same Month Revenue<br/>'+totalRev.moneyString();
        $("#adminDashboardSameMonthRevenueChart").parent().html("<canvas id=\"adminDashboardSameMonthRevenueChart\" height=\"100\"></canvas>");
        $.ChartJs.respChart("adminDashboardSameMonthRevenueChart",'Bar', sameMonthChart,{
            dateparts:options.by,
            redraw: 'generateSameMonthRevenue',
            legend: {
                display: true
            },
            scales: {
                yAxes: [{
                    id: 'A',
                    type: 'linear',
                    position: 'left',
                    ticks: {
                        min:0
                    }
                }]
            }
        });
    },

    'showAdminReservations': function() {
        $(".rightContent").hide();
        Vector.moveFiltersTo("#adminReservations");
        api({
            'method':'getReservationData',
            'mode': 'admin'
        },function(data) {
            Vector.adminReservations=data.reservations;
            Vector.adminDashboard.cancelledReservations = data.cancelledReservations;
            Vector.generateAdminReservationTable();
            $("#adminReservations").show();
            Vector.updateUserTodayReservationTable();
            Vector.generateCancelledReservations();
            $("#adminTodaysReservations").show();
        });
    },

    'generateCleaningRevenueChart': function(options) {
        if(!options) options = {};
        if(!('by' in options)) options.by = 'day';

        var totalrev = 0;
        var chartdata = {
            labels: [],
            datasets: []
        };
        var dateLabel;
        var datepart=undefined;
        Vector.resetColorIndex();
        for(var city in Vector.hospitalityData.cleaningRevenue) {
            var r=Vector.hospitalityData.cleaningRevenue[city];
            var newds = {
                data:[],
                label:city
            };
            Object.assign(newds,Vector.getColor());
            var datacount=0;
            for(var m=moment(Vector.startDateFilter); m.isSameOrBefore(Vector.endDateFilter); m.add(1,'days')) {
                dateLabel=m.format("YYYY-MM-DD");
                switch (options.by) {
                    case 'day':
                        curdatepart = dateLabel;
                        break;
                    case 'month':
                        //sum the month values until we encounter a new month value
                        curdatepart = m.format("MMM");
                        break;
                    case 'year':
                        curdatepart = m.format("YYYY");
                        break;
                }
                if (datepart != curdatepart) {
                    datepart = curdatepart;
                    if(chartdata.datasets.length==0) {
                        chartdata.labels.push(curdatepart);
                    }
                    newds.data.push(0);
                    datacount++;
                }
                var rev = (dateLabel in r)?parseFloat(r[dateLabel]):0;
                totalrev+=rev;
                newds.data[datacount-1] += rev;
            }
            chartdata.datasets.push(newds);
        }
      //  console.log(chartdata);

        $("#adminHospitalityCleaningChart").parent().html("<canvas id=\"adminHospitalityCleaningChart\" height=\"100\"></canvas>");
        $.ChartJs.respChart("adminHospitalityCleaningChart",'Bar',chartdata,
            {
                chartTitle: 'Cleaning Revenue By Checkout<br/>'+totalrev.moneyString(),
                dateparts:options.by,
                redraw: 'generateCleaningRevenueChart',
                legend: {
                    display: false
                },
                title: {
                    display: false,
                    text: ''
                },
                tooltips: {
                    mode: 'index',
                    intersect: false
                },
                responsive: true,
                scales: {
                    xAxes: [{
                        stacked: true,
                    }],
                    yAxes: [{
                        stacked: true
                    }]
                }
            }
        );

    },

    'showAdminHospitality': function() {
        $(".rightContent").hide();
        Vector.moveFiltersTo("#adminHospitality");
        $("#adminHospitality_checkouts").html(Vector.adminDashboard.stats.todaysCheckouts);

        api({
            method:'getHospitalityData'
        },function(data) {
            Vector.hospitalityData=data;
            Vector.generateCleaningRevenueChart();
        });
        $("#adminHospitality").show();
    },

    'generateAdminReservationTable': function() {
        var matchingReservations=[];
        var useConfirmation = $("#reservations_confirmedAtCheckbox").is(":checked");
        var useCheckin = $("#reservations_checkinCheckbox").is(":checked");
        var useCheckout = $("#reservations_checkoutCheckbox").is(":checked");
        var onlyCancelleations = $("#reservations_cancelledCheckbox").is(":checked");
        var totalRevInRange = 0;
        var totalRev=0;

        $.each(Vector.adminReservations, function(i,r) {
            var addit=0;
            if(onlyCancelleations && r.status!='canceled') {
                return;
            } else {
                addit = 1;
            }

            if(useConfirmation) {
                if(r.confirmedAt && moment(r.confirmedAt).isBetween(Vector.startDateFilter,Vector.endDateFilter,null,'[]'))
                    addit = 1;
                else return;
            }
            if(useCheckin) {
                if(moment(r.checkIn).isBetween(Vector.startDateFilter,Vector.endDateFilter,null,'[]'))
                    addit=1;
                else return;
            }

            if(useCheckout) {
                if (moment(r.checkOut).isBetween(Vector.startDateFilter, Vector.endDateFilter, null, '[]'))
                    addit = 1;
                else return;
            }
            if(addit) {
                matchingReservations.push(r);
                var rev = parseFloat(r.hostPayout) - parseFloat(r.fareCleaning);
                totalRev += rev;
                r.revInRange = Vector.revInRange(rev,moment(r.checkIn),moment(r.checkOut),Vector.startDateFilter,Vector.endDateFilter);
                totalRevInRange+= r.revInRange;
            }

        });
        try {
            if (!$.fn.DataTable.isDataTable("#adminReservationsTable")) {
                var table = $("#adminReservations").find("table").DataTable({
                    dom: 'Bfrtip',
                    buttons: [ 'copy', 'csv', 'excel', 'pdf', 'print' ],
                    data: matchingReservations,
                    columns: [
                        {data: "_id", title: "id"},
                        {data: "fullName", title: "Guest", "fnCreatedCell": Vector.guestyGuestDatatableLink},
                        {data: "nickname", title: "Name", "fnCreatedCell": function (nTd, sData, oData, iRow, iCol) {
                            $(nTd).html("<a href='javascript:Vector.showAdminListingPerformance(\""+oData.listingId+"\");'>"+
                            oData.nickname+"</a>");
                            }
                        },
                        {data: "address_city", title: "City"},
                        {data: "confirmedAt", title: "Confirmed", "render": dateFormatter},
                        {data: "hostPayout", title: "Payout", "render": moneyFormatter},
                        {
                            data: "hostPayout", title: "ADR", render: function ( data, type, row ) {
                                var numNights = moment(row.checkOut).diff(moment(row.checkIn), 'days');
                                var adr = (parseFloat(data) - parseFloat(row.fareCleaning)) / numNights;

                                if (type === 'display') {
                                    return('$' + adr.toFixed(0));
                                    }

                                return(adr.toFixed(2));
                            }
                        },
                        {data: "revInRange", title: "Rev in Range", "render": moneyFormatterNoCents},
                        {data: "source", title: "source", "fnCreatedCell": Vector.sourceCell},
                        {data: "checkIn", title: "Check In"},
                        {data: "checkOut", title: "Check Out"},
                        {data: "compadr", title: "Comp ADR", render: function ( data, type, row ) {
                            var isNotDefinedCompAdr = typeof(data) === 'undefined' || data === null || data == 0;
                            if (type === 'display' || type ==='filter') {
                                return isNotDefinedCompAdr ? 'n/a' : '$' + Number.parseInt(data);
                             }
                            return isNotDefinedCompAdr ? -99999 : Number.parseInt(data);
                            }
                        },
                        {data: "hostPayout", title: "ADR Delta", render: function ( data, type, row ) {
                            var numNights = moment(row.checkOut).diff(moment(row.checkIn), 'days');
                            var adr = (parseFloat(data) - parseFloat(row.fareCleaning)) / numNights;
                            var delta = adr - parseFloat(row.compadr);
                            var isNotDefinedCompAdr = row.compadr == 0 || row.compadr === null;

                            if (type === 'display' || type ==='filter') {
                                   return isNotDefinedCompAdr ? 'n/a' : '$' + Number.parseInt(delta);
                                }
                            return isNotDefinedCompAdr ? -99999 : Number.parseInt(delta);
                            }
                        },
                        {data: "status", title: "status"},
                        {data: "spinnakerId", title: "extId", className: "extIdCell", "fnCreatedCell": function (nTd, sData, oData, iRow, iCol) {
                            $(nTd).click(()=> {
                               var extId = prompt("What should the external ID for reservation "+oData._id+" be?",oData.spinnakerId);
                               if(extId!=null)
                               api({method:'saveExtId',extId:extId,reservationId:oData._id},(response)=>{
                                   if(response.success) {
                                       $(nTd).html(extId);
                                   }
                               });
                            });
                        }}
                    ]
                });
            } else {
                $('#adminReservationsTable').dataTable().fnClearTable();
                $('#adminReservationsTable').dataTable().fnAddData(matchingReservations);
            }
        } catch(e) { console.log(e);}
        $('#adminReservationsTitle').html("<h4 class='ml-3 mt-2 header-title'>Reservations</h4><br/><h6 class='ml-3 mt-2'>Total Rev: "+totalRev.moneyString()+"<br/>Total Rev in Range: "+totalRevInRange.moneyString()+"</h6>");
    },
    'updateUserTodayReservationTable': function() {
        Vector.adminDashboard.todaysReservations.forEach(function (reservation, index) {
            var matchingListing = Vector.adminDashboard.occupancyAnalytics.next30.find(function (occupancyData) {
                return reservation.listingId == occupancyData._id;
            });
            if(matchingListing)
                Vector.adminDashboard.todaysReservations[index]['occ'] = matchingListing.occ;
            else
                Vector.adminDashboard.todaysReservations[index]['occ'] = 0;
        });

        $("#todaysReservationsTable").html("<h4 class='m-t-0 header-title'>Today's Reservations</h4><table class='p-1 table w-100'></table>");
        $("#todaysReservationsTable").find("table").on("draw.dt", function (){
            setTimeout(function () {
                $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
            }, 200);
        }).DataTable({
            sScrollX: "100%",
            sScrollXInner: "110%",
            bScrollCollapse: true,
            data: Vector.adminDashboard.todaysReservations,
            columns: [
                {data: "listingId", title: "", fnCreatedCell: Vector.thumbnailLink},
                {data: "nickname", title: "name", "fnCreatedCell": Vector.guestyReservationDatatableLink},
                {data: "address_city", title: "city"},
                {data: "hostPayout", title: "payout", "render": moneyFormatter},
                {
                    data: "hostPayout", title: "ADR", render: function ( data, type, row ) {
                        var numNights = moment(row.checkOut).diff(moment(row.checkIn), 'days');
                        var adr = (parseFloat(data) - parseFloat(row.fareCleaning)) / numNights;

                        if (type === 'display') {
                            return('$' + adr.toFixed(0));
                        }

                        return(adr.toFixed(2));
                    }
                },
                {data: "source", title: "source", "fnCreatedCell": Vector.sourceCell},
                {data: "checkIn", title: "checkIn"},
                {data: "checkOut", title: "checkOut"},
                {data: "compadr", title: "Comp ADR", render: function ( data, type, row ) {
                    var isNotDefinedCompAdr = typeof(data) === 'undefined' || data === null || data == 0;
                    if (type === 'display' || type ==='filter') {
                        return isNotDefinedCompAdr ? 'n/a' : '$' + Number.parseInt(data);
                     }
                    return isNotDefinedCompAdr ? -99999 : Number.parseInt(data);
                    }
                },
                {data: "hostPayout", title: "ADR Delta", render: function ( data, type, row ) {
                    var numNights = moment(row.checkOut).diff(moment(row.checkIn), 'days');
                    var adr = (parseFloat(data) - parseFloat(row.fareCleaning)) / numNights;
                    var delta = adr - parseFloat(row.compadr);
                    var isNotDefinedCompAdr = row.compadr == 0 || row.compadr === null;

                    if (type === 'display' || type ==='filter') {
                           return isNotDefinedCompAdr ? 'n/a' : '$' + Number.parseInt(delta);
                        }
                    return isNotDefinedCompAdr ? -99999 : Number.parseInt(delta);
                    }
                },
                {data:"occ", title: "next 30 days occupancy", "render": renderPercentColumn}
            ]
        });
    },

    'generateCancelledReservations': function(options) {

        $("#cancelledReservationsTable").html("<h4 class='m-t-0 header-title'>Cancelled Reservations</h4><table class='p-1 table w-100'></table>");
        $("#cancelledReservationsTable").find("table").on("draw.dt", function (){
            setTimeout(function () {
                $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
            }, 200);
        }).DataTable({
            sScrollX: "100%",
            sScrollXInner: "110%",
            bScrollCollapse: true,
            dom: 'Bfrtip',
            buttons: {
                dom:{
                    container:{
                        className: "top-right-btn-container"
                    }
                },
                buttons:[{
                    extend: "csv",
                    className: "downloadCSV",
                    titleAttr: "Export in csv",
                    text: "<img src='../images/xls-logo.svg' >",
                    init: function(api, node, config) {
                        $(node).removeClass('btn btn-secondary buttons-html5')
                    }
                }]
            },
            data: Vector.adminDashboard.cancelledReservations,
            columns: [
                {data: "nickname",title:"name","fnCreatedCell": Vector.guestyReservationDatatableLink},
                {data: "checkIn", title: "checkIn"},
                {data: "checkOut", title: "checkOut"},
                {data: "source", title: "source" ,"fnCreatedCell": Vector.sourceCell},
                {data: "fareAccommodation", title: "accomodation fare" ,"render": moneyFormatter},
                {
                    data: "confirmedAt", title:"confirmed date", render: function ( data, type, row ) {
                        if ( type === 'filter') {
                            return moment(data).format('MMMM Do YYYY');
                        }
                        return moment(data).format('YYYY-MM-DD');
                    }
                },
                {data: "canceledBy",title:"cancelled by", render: function ( data, type, row ) {
                        return data === null ? 'n/a' : data ;
                    }
                },
                {
                    data: "canceledAt", title:"cancelled date", render: function ( data, type, row ) {
                        if ( type === 'filter') {
                            return moment(data).format('MMMM Do YYYY');
                        }
                        return moment(data).format('YYYY-MM-DD');
                    }
                }
            ]
        });

        var getDatasetTemplate = function (label) {
                return Object.assign({
                    label: label,
                    data: [],
                    dataType: 'amount'
                }, Vector.getColor());
            },
            addCancelledReservationInDate = function (source, date) {
                source[date] = source.hasOwnProperty(date) ? ++source[date] : 1;
            },
            dateFormats = {
                day : 'YYYY-MM-DD',
                month : 'YYYY-MM',
                year: 'YYYY'
            },
            labels = [],
            selectedFilter,
            cancelledReservationsBySource,
            datasets,
            cancelledReservationChart,
            options;


        if(!options) options = {};
        if(!('by' in options)) options.by = 'day';
        selectedFilter = dateFormats[options.by];

        cancelledReservationsBySource = Vector.adminDashboard.cancelledReservations.reduce(function (cancelledReservations, reservation) {
            var date = moment(reservation.canceledAt).format(selectedFilter);

            if (!cancelledReservations.hasOwnProperty(reservation.source)) {
                cancelledReservations[reservation.source] = {};
            }

            if (labels.indexOf(date) === -1) {
                labels.push(date);
            }

            addCancelledReservationInDate(cancelledReservations[reservation.source], date);

            return cancelledReservations;
        }, {});

        Vector.resetColorIndex();
        datasets = Object.keys(cancelledReservationsBySource).map(function (sourceLabel) {
            var dataset = getDatasetTemplate(sourceLabel)
                source =  cancelledReservationsBySource[sourceLabel];

            dataset.data = labels.map(function (date) {
                return source.hasOwnProperty(date) ? source[date] : 0;
            });

            return dataset;
        });

        cancelledReservationChart = {
            labels : labels,
            datasets : datasets
        };

        options = {
            chartTitle: 'Cancelled Reservations by '+ options.by,
            dateparts: options.by,
            redraw: 'generateCancelledReservations',
            title: {
                display: false,
                text: ''
            },
            tooltips: {
                mode: 'index',
                intersect: false
            },
            responsive: true,
            scales: {
                xAxes: [{
                    stacked: true,
                }],
                yAxes: [{
                    stacked: true
                }],
            },
        };

        $('#cancelledReservationsChartContainer').html('<canvas id="cancelledReservationsChart"></canvas>');
        $.ChartJs.respChart('cancelledReservationsChart', 'Bar', cancelledReservationChart, options);
    },

    'generateRevenueByCheckin': function(options) {
        if(!options) options = {};
        if(!('by' in options)) options.by = 'day';

        var channelRev = [];
        var labels = [];
        var totalrev = 0;
        Vector.adminDashboard.payoutsByDay.forEach(function (r) {
            if (!(r.source in channelRev)) channelRev[r.source] = [];
            var m = moment(r.date).format("YYYY-MM-DD");
            var rev=parseFloat(r.rev);
            channelRev[r.source][m] = rev;
            totalrev+=rev;
        });

        var datasets = [];
        Vector.resetColorIndex();

        for (var source in channelRev) {
            var d = {
                label: source,
                data: []
            };
            Object.assign(d,Vector.getColor());
            var curdatepart=undefined;
            var datepart=undefined;
            var dateLabel;
            var datacount=0;
            for(var m=moment(Vector.startDateFilter); m.isSameOrBefore(Vector.endDateFilter); m.add(1,'days')) {
                dateLabel=m.format("YYYY-MM-DD");
                switch (options.by) {
                    case 'day':
                        curdatepart = dateLabel;
                        break;
                    case 'month':
                        //sum the month values until we encounter a new month value
                        curdatepart = m.format("MMM");
                        break;
                    case 'year':
                        curdatepart = m.format("YYYY");
                        break;
                }
                if (datepart != curdatepart) {
                    datepart = curdatepart;
                    if(datasets.length==0) {
                        labels.push(curdatepart);
                    }
                    d.data.push(0);
                    datacount++;
                }
                d.data[datacount-1] += (dateLabel in channelRev[source])?channelRev[source][dateLabel]:0;
            }
            datasets.push(d);
        }
       // console.log(datasets)

        $("#adminDashboardRevenueByDayChart").parent().html("<canvas id=\"adminDashboardRevenueByDayChart\" height=\"100\"></canvas>");

        var chartdata = {
            labels: labels,
            datasets: datasets
        };
        var chartoptions = {
            chartTitle: 'Revenue By Checkin<br/>'+totalrev.moneyString(),
            dateparts:options.by,
            redraw: 'generateRevenueByCheckin',
            legend: {
                display: false
            },
            title: {
                display: false,
                text: ''
            },
            tooltips: {
                mode: 'index',
                intersect: false
            },
            responsive: true,
            scales: {
                xAxes: [{
                    stacked: true,
                }],
                yAxes: [{
                    stacked: true
                }],
            },
            revByCheckin : true
        };
        if(options.by=='day') {
            $.extend(chartoptions,{
                scales: {
                    xAxes: [{
                        categoryPercentage: 1.0,
                        barPercentage: 1.0,
                        stacked:true
                    }],
                    yAxes: [{
                        stacked: true,
                    }]
                }
            });
        }
        $.ChartJs.respChart("adminDashboardRevenueByDayChart",'Bar',chartdata,chartoptions);


       var downloadCSV = $(".revByCheckinCSV");
       downloadCSV.click(function () {

           var headers = {channel : 'Channel'};

           labels.forEach(function (label) {
               headers[label] = label;
           });

           var items = [];

           datasets.forEach(function (source) {
               var row = {
                   channel: source.label
               };

               source.data.forEach(function (date) {
                   row[date] = date;
               });

               items.push(row);
           });

           var fileTitle = 'revenue by checkin';

           exportCSVFile(headers, items, fileTitle);
           });
    },

    'generateRevenueByBooking': function(options) {
        if(!options) options ={};
        if(!('by' in options)) options.by = 'day';
        var revenueChart = {
            labels: [],
            datasets: [],
            scales: {
                yAxes: [{
                    ticks: {
                        min:0
                    }
                }]
            }
        };

        var channelRev = [];
        var totalrev = 0;
        Vector.adminDashboard.revenueByDay.forEach(function (r) {
            if (!(r.source in channelRev)) channelRev[r.source] = [];
            var m = moment(r.date).format("YYYY-MM-DD");
            var rev=parseFloat(r.rev);
            channelRev[r.source][m] = rev;
            totalrev+=rev;
        });

        Vector.resetColorIndex();

        for (var source in channelRev) {
            var d = {
                label: source,
                data: []
            };
            Object.assign(d,Vector.getColor());
            var curdatepart=undefined;
            var datepart=undefined;
            var dateLabel;
            var datacount=0;
            for(var m=moment(Vector.startDateFilter); m.isSameOrBefore(Vector.endDateFilter); m.add(1,'days')) {
                dateLabel=m.format("YYYY-MM-DD");
                switch (options.by) {
                    case 'day':
                        curdatepart = dateLabel;
                        break;
                    case 'month':
                        //sum the month values until we encounter a new month value
                        curdatepart = m.format("MMM");
                        break;
                    case 'year':
                        curdatepart = m.format("YYYY");
                        break;
                }
                if (datepart != curdatepart) {
                    datepart = curdatepart;
                    if(revenueChart.datasets.length==0) {
                        revenueChart.labels.push(curdatepart);
                    }
                    d.data.push(0);
                    datacount++;
                }
                d.data[datacount-1] += (dateLabel in channelRev[source])?channelRev[source][dateLabel]:0;
            }
            revenueChart.datasets.push(d);
        }

        revenueChart.chartTitle='Revenue by Booking<br/>'+totalrev.moneyString(),
        $("#adminDashboardRevenueByBookingChart").parent().html("<canvas id=\"adminDashboardRevenueByBookingChart\" height=\"100\"></canvas>");
        var chartoptions = {
            dateparts:options.by,
            redraw: 'generateRevenueByBooking',
            legend: {
                display: false
            },
            scales: {
                xAxes: [{
                    categoryPercentage: 1.0,
                    barPercentage: 1.0,
                    stacked:true
                }],
                yAxes: [{
                    ticks: {
                        min:0
                    },
                    stacked:true
                }]
            },
            tooltips: {
                mode: 'index',
                intersect: false
            },
            revByBooking: true
        };

        $.ChartJs.respChart("adminDashboardRevenueByBookingChart",'Bar',revenueChart,chartoptions);

        var downloadCSV = $(".revByBookingCSV");
        downloadCSV.click(function () {

            var headers = {
                date: 'Date',
                revenue: 'Revenue'
            };

            var items = [];

            revenueChart.labels.forEach(function (date, index) {
                var row = {
                    date: date,
                    revenue: revenueChart.datasets[0].data[index]
                };
                items.push(row);
            });

            var fileTitle = 'revenue by booking';

            exportCSVFile(headers, items, fileTitle);
            });

    },

    'getCost':function(c,monthstart) {
        var totalCost=0;
        var totalCosts = {
            lease:0,
            furniture:0,
            utilities:0
        };
        var l;
        var leaseStartDate;
        for(var i in Vector.listings) {
            l = Vector.listings[i];
            if (l.isListed == 0 || l.active == 0) {
                continue;
            }
            if(l.address_city==c || l.nickname==c) {
                var leaseCost = parseFloat(l.leaseCost);
                var furnitureCost = parseFloat(l.furnitureCost);
                var utilitiesCost = parseFloat(l.utilitiesCost);
                var mycost = (leaseCost+furnitureCost+utilitiesCost);
                if(monthstart && l.leaseStartDate && (leaseStartDate=moment(l.leaseStartDate))) {
                    if(leaseStartDate.isAfter(monthstart) && leaseStartDate.isBefore(monthstart.endOf('month'))) {
                        var prorate =(leaseStartDate.clone().endOf('month').diff(leaseStartDate, 'days') / monthstart.daysInMonth());
                        totalCost += mycost * prorate;
                        totalCosts.lease+=leaseCost*prorate;
                        totalCosts.furniture+=furnitureCost*prorate;
                        totalCosts.utilities+=utilitiesCost*prorate;
                    } else if(leaseStartDate.isBefore(monthstart)) { //add cost only if lease started after this month
                        totalCost += mycost;
                        totalCosts.lease+=leaseCost||0;
                        totalCosts.furniture+=furnitureCost||0;
                        totalCosts.utilities+=utilitiesCost||0;
                    }
                } else {
                    totalCost += mycost;
                    totalCosts.lease+=leaseCost||0;
                    totalCosts.furniture+=furnitureCost||0;
                    totalCosts.utilities+=utilitiesCost||0;
                }
            }
        }
        totalCosts.totalCost = totalCost;
        return totalCosts;
    },

    'generateAdvancedBookingCharts': function() {
        var chart = {
            labels: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30],
            datasets: []
        }
        var currentcity="";
        var currentindex=0;
        Vector.resetColorIndex();
        var d;
        Vector.adminDashboard.advancedBookingByCheckin.forEach(function(i) {
            var days = parseInt(i.numDays);
            if(currentcity!=i.address_city || d==undefined) {
                d = {
                    label: i.address_city,
                    data:[],
                    dataType:'float',
                    fill: false,
                    type:"line",
                    borderColor: '#000',
                    borderWidth: 1
                };
                Object.assign(d,Vector.getColor());
                chart.datasets.push(d);
                currentindex=0;
                currentcity=i.address_city;
            }
            while(days>currentindex) {
                d.data[currentindex]=0;
                if(currentindex++ > 30) return;
            }
            d.data[currentindex]=parseInt(i.count);
            currentindex++;
        });

        $("#adminDashboardAdvancedBookingByCheckin").parent().html("<canvas id=\"adminDashboardAdvancedBookingByCheckin\" height=\"100\"></canvas>");

        $.ChartJs.respChart("adminDashboardAdvancedBookingByCheckin",'line',chart,{
            chartTitle:'Advanced Booking By Checkin',
            scales: {
                yAxes: [{
                    id: 'A',
                    type: 'linear',
                    position: 'left',
                    ticks: {
                        min:0
                    }
                }]
            }
        });

        var totals=[];
        var revtotals=[];
        var grandtotalrev=0;
        for(i=0; i<31; i++) { totals[i]=0; revtotals[i]=0; }

        chart = {
            labels: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30],
            datasets: []
        }
        currentcity="";
        currentindex=0;
        Vector.resetColorIndex();
        var d;
        Vector.adminDashboard.advancedBookingByConfirmation.forEach(function(i) {
            var days = parseInt(i.numDays);
            grandtotalrev += parseFloat(i.rev);
            if(days<=30) {
                if (totals[days]) totals[days] += parseInt(i.count);
                else totals[days] = parseInt(i.count);
                if (revtotals[days]) revtotals[days] += parseFloat(i.rev);
                else revtotals[days] = parseFloat(i.rev);
            }

            if(currentcity!=i.address_city) {
                d = {
                    label: i.address_city,
                    data:[],
                    dataType:'float',
                    fill: false,
                    type:"line",
                    borderColor: '#000',
                    borderWidth: 1
                };
                Object.assign(d,Vector.getColor());
                chart.datasets.push(d);
                currentindex=0;
                currentcity=i.address_city;
            }
            while(days>currentindex) {
                d.data[currentindex]=0;
                if(currentindex++ > 30) return;
            }
            d.data[currentindex]=parseInt(i.count);
            currentindex++;
        });

        $("#adminDashboardAdvancedBookingByConfirmation").parent().html("<canvas id=\"adminDashboardAdvancedBookingByConfirmation\" height=\"100\"></canvas>");

        $.ChartJs.respChart("adminDashboardAdvancedBookingByConfirmation",'line',chart,{
            chartTitle:'Advanced Booking By Confirmation',
            scales: {
                yAxes: [{
                    id: 'A',
                    type: 'linear',
                    position: 'left',
                    ticks: {
                        min:0
                    }
                }]
            }
        });



        chart = {
            labels: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30],
            datasets: []
        }
        currentcity="";
        currentindex=0;
        Vector.resetColorIndex();
        var d = {
            label: 'Total',
            data:[],
            dataType:'float',
            fill: false,
            type:"line",
            borderColor: '#000',
            borderWidth: 1,
            yAxisID: 'A'
        };
        Object.assign(d,Vector.getColor());
        chart.datasets.push(d);
        currentindex=0;
        totals.forEach(function(i) {
            d.data[currentindex]=i;
            currentindex++;
        });
        var grandtotalrevarray=[];
        for(var i=0; i<30; i++) {
            grandtotalrevarray[i]=grandtotalrev;
        }

        var daypercentds = {
            label: 'Revenue',
            data:[],
            dataType:'valuewithpercent',
            fill: true,
            yAxisID:'B',
            type:"bar",
            totals:grandtotalrevarray,
            borderColor: '#000',
            borderWidth: 1,
            stacked:true
        };
        var fivedaypercentds = {
            label: 'Five Day Revenue',
            data:[],
            dataType:'valuewithpercent',
            fill: false,
            totals: grandtotalrevarray,
            yAxisID:'B',
            type:"bar",
            borderColor: '#000',
            borderWidth: 0,
            stacked:true
        };
        Object.assign(daypercentds,Vector.getColor());
        Object.assign(fivedaypercentds,Vector.getColor());
        currentindex=0;
        var currentfivedaytotal=0;
        revtotals.forEach(function(r) {
            daypercentds.data[currentindex]=r;
            currentfivedaytotal+=r;
            currentindex++;
            if(currentindex%5==0) {
                fivedaypercentds.data[currentindex-5]=currentfivedaytotal;
                fivedaypercentds.data[currentindex-4]=currentfivedaytotal;
                fivedaypercentds.data[currentindex-3]=currentfivedaytotal;
                fivedaypercentds.data[currentindex-2]=currentfivedaytotal;
                fivedaypercentds.data[currentindex-1]=currentfivedaytotal;
                currentfivedaytotal=0;
            }
        });
        chart.datasets.push(daypercentds);
        chart.datasets.push(fivedaypercentds);

        $("#adminDashboardAdvancedBookingTotal").parent().html("<canvas id=\"adminDashboardAdvancedBookingTotal\" height=\"100\"></canvas>");

        $.ChartJs.respChart("adminDashboardAdvancedBookingTotal",'line',chart,{
            chartTitle:'Advanced Booking By Confirmation Totals With Revenue',
            scales: {
                yAxes: [
                {
                    id: 'A',
                    type: 'linear',
                    position: 'left',
                    ticks: {
                        min: 0
                    }
                },
                {
                        id: 'B',
                        type: 'linear',
                        position: 'right',
                        stacked: false,
                        ticks: {
                            min: 0
                        }
                }],
                xAxes: [{
                    stacked:true,
                    categoryPercentage: 1.0,
                    barPercentage: 1.0
                }]
            }
        });
    },

    'updateADRvDBA': function() {
        var maxADR = parseInt($('input.maxADR').val());
        var maxDBA = parseInt($('input.maxDBA').val());

        var areNumbers = !isNaN(maxADR) && !isNaN(maxDBA);
        var areGreterThanZero = (maxADR > 0) && (maxDBA > 0);

        if (!areNumbers || !areGreterThanZero) {
            alert('The values must be numeric. Please try again.');
            return;
        }

        var chart = $('#adminDashboardADRvDBA').data('chart');

        chart.options.scales.xAxes[0].ticks.max = maxDBA;
        chart.options.scales.yAxes[0].ticks.max = maxADR;

        chart.update();

        $('input.maxADR').val(600);
        $('input.maxDBA').val(90);
        $('#ADRvDBASettings').modal('toggle');
    },

    'generateADRvDBA': function() {


        var chart = {
            type:'Scatter',
            labels: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30],
            datasets: []
        };

        Vector.adminDashboard.ADRvDBA.forEach(function(i) {
            var dba = parseInt(i.dba);
            var adr = parseFloat(i.adr);
            var data = {
                x:dba,
                y:adr
            };
            var index = chart.datasets.findIndex(function (element) {
                return element.label == i.address_city;
            });
            if (index === -1) {
                chart.datasets.push({
                    label: i.address_city,
                    data:[data]
                });
            } else {
                chart.datasets[index].data.push(data);
            }
        });

        $("#adminDashboardADRvDBA").parent().html("<canvas id=\"adminDashboardADRvDBA\" height=\"100\"></canvas>");
        chart.datasets.forEach(function (dataset) {
            Object.assign(dataset, Vector.getColor());
        });
        var displayLegends = chart.datasets.length < 15 ? true : false;

        $.ChartJs.respChart("adminDashboardADRvDBA",'Scatter',chart,{
            chartTitle:'ADR vs Booking Window',
            legend: {
                display: displayLegends
            },
            scales: {
                yAxes: [
                    {
                        id: 'A',
                        label: 'ADR',
                        type: 'linear',
                        position: 'left',
                        ticks: {
                            min: 0,
                            max:600
                        }
                    }
                    ],
                xAxes: [{
                    type: 'linear',
                    position: 'bottom',
                    ticks: {
                        min: 0,
                        max:90
                    }
                }]
            },
            ADRvDBA: true
        });
    },

    'generateRentProjectionTable':function() {
        $("#rentProjectionTable").html("<h4 class='m-t-0 header-title'>Rent Projections</h4><table class='p-1 table w-100'></table>");
        $("#rentProjectionTable").find("table").on("draw.dt", function (){
            setTimeout(function () {
                $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
            }, 200);
            }).DataTable({
            sScrollX: "100%",
            sScrollXInner: "110%",
            bScrollCollapse: true,
            data:Vector.adminDashboard.rentProjection,
            order: [[1,'asc'],[0,'asc']],
            columns: [
                {data: "bedrooms",title:"bedrooms"},
                {data: "address_city",title:"city"},
                {data: "avgMonthlyRev",title:"avgMonthlyRev", "render": moneyFormatter},
                {data: "avgCost",title:"avgCost", "render": moneyFormatter},
                {data: "costFor40Margin",title:"costFor40Margin", "render": moneyFormatter},
                {data: "costFor30Margin",title:"costFor30Margin", "render": moneyFormatter},
                {data: "costFor20Margin",title:"costFor20Margin", "render": moneyFormatter},
                {data: "costFor10Margin",title:"costFor10Margin", "render": moneyFormatter}
            ]
        });
    },
    'showAdminAnalytics': function() {
        $(".rightContent").hide();
        Vector.moveFiltersTo("#adminAnalytics");
        api({method:'getAdminAnalytics'},function(response) {
            $.extend(Vector.adminDashboard,response);
            Vector.generateAdvancedBookingCharts();
            Vector.generateADRvDBA();
            $("#adminAnalytics").show();
        });
    },
    'showAdminTodaysResume': function() {
        $(".rightContent").hide();
        $("#todaysCheckinsTable").html("<h4 class='m-t-0 header-title'>Today's Checkins</h4><table class='p-1 table w-100'></table>");
        $("#todaysCheckinsTable").find("table").DataTable({
            data:Vector.adminDashboard.todaysCheckins,
            columns: [
                {data: "picture", title:"", "fnCreatedCell": Vector.thumbnailLink},
                {data: "fullname", title:"guest", "fnCreatedCell": Vector.guestyGuestDatatableLink},
                {data: "nickname",title:"name"},
                {data: "address_city",title:"city"},
                {data: "checkOut",title:"checkout"},
                {data: "confirmedAt", title: "confirmed"},
                {data: "hostPayout",title:"payout", "render": moneyFormatter},
                {
                    data: "hostPayout", title: "ADR", render: function ( data, type, row ) {
                        var numNights = moment(row.checkOut).diff(moment(row.checkIn), 'days');
                        var adr = (parseFloat(data) - parseFloat(row.fareCleaning)) / numNights;

                        if (type === 'display') {
                            return('$' + adr.toFixed(0));
                            }

                        return(adr.toFixed(2));
                    }
                },
                {data: "compadr", title: "Comp ADR", render: function ( data, type, row ) {
                    var isNotDefinedCompAdr = typeof(data) === 'undefined' || data === null || data == 0;
                    if (type === 'display' || type ==='filter') {
                        return isNotDefinedCompAdr ? 'n/a' : '$' + Number.parseInt(data);
                     }
                    return isNotDefinedCompAdr ? -99999 : Number.parseInt(data);
                    }
                },
                {data: "hostPayout", title: "ADR Delta", render: function ( data, type, row ) {
                    var numNights = moment(row.checkOut).diff(moment(row.checkIn), 'days');
                    var adr = (parseFloat(data) - parseFloat(row.fareCleaning)) / numNights;
                    var delta = adr - parseFloat(row.compadr);
                    var isNotDefinedCompAdr = row.compadr == 0 || row.compadr === null;

                    if (type === 'display' || type ==='filter') {
                           return isNotDefinedCompAdr ? 'n/a' : '$' + Number.parseInt(delta);
                        }
                    return isNotDefinedCompAdr ? -99999 : Number.parseInt(delta);
                    }
                },
                {data: "source",title:"source", "fnCreatedCell": Vector.sourceCell},
            ]
        });
        
        $("#todaysCheckoutsTable").html("<h4 class='m-t-0 header-title'>Today's Checkouts</h4><table class='p-1 table w-100'></table>");
        $("#todaysCheckoutsTable").find("table").DataTable({
            data:Vector.adminDashboard.todaysCheckouts,
            columns: [
                {data: "picture", title:"", "fnCreatedCell": Vector.thumbnailLink},
                {data: "fullname", title:"guest", "fnCreatedCell": Vector.guestyGuestDatatableLink},
                {data: "nickname",title:"name"},
                {data: "address_city",title:"city"},
                {data: "checkIn",title:"checkin"},
                {data: "confirmedAt", title: "confirmed"},
                {data: "hostPayout",title:"payout", "render": moneyFormatter},
                {
                    data: "hostPayout", title: "ADR", render: function ( data, type, row ) {
                        var numNights = moment(row.checkOut).diff(moment(row.checkIn), 'days');
                        var adr = (parseFloat(data) - parseFloat(row.fareCleaning)) / numNights;

                        if (type === 'display') {
                            return('$' + adr.toFixed(0));
                            }

                        return(adr.toFixed(2));
                    }
                },
                {data: "compadr", title: "Comp ADR", render: function ( data, type, row ) {
                    var isNotDefinedCompAdr = typeof(data) === 'undefined' || data === null || data == 0;
                    if (type === 'display' || type ==='filter') {
                        return isNotDefinedCompAdr ? 'n/a' : '$' + Number.parseInt(data);
                     }
                    return isNotDefinedCompAdr ? -99999 : Number.parseInt(data);
                    }
                },
                {data: "hostPayout", title: "ADR Delta", render: function ( data, type, row ) {
                    var numNights = moment(row.checkOut).diff(moment(row.checkIn), 'days');
                    var adr = (parseFloat(data) - parseFloat(row.fareCleaning)) / numNights;
                    var delta = adr - parseFloat(row.compadr);
                    var isNotDefinedCompAdr = row.compadr == 0 || row.compadr === null;

                    if (type === 'display' || type ==='filter') {
                           return isNotDefinedCompAdr ? 'n/a' : '$' + Number.parseInt(delta);
                        }
                    return isNotDefinedCompAdr ? -99999 : Number.parseInt(delta);
                    }
                },
                {data: "source",title:"source", "fnCreatedCell": Vector.sourceCell},
            ]
        });
        $("#AdminTodaysResume").show();
    },
    'moveFiltersTo': function(target) {
        $("#AdminDashboardFilters").prependTo(target);
        if ($('#Admin_unitFilterSelectDiv').html().trim() == '') {
            $('#User_unitFilterSelectDiv').children().appendTo('#Admin_unitFilterSelectDiv');
        }
    },
    'setupOccupancyAndRevenueTable': function() {

        var avgOccVsRev = [];
        var occCount;
        var avgOccVsRevTemplate = {
            date: '',    // year-month for the calculations
            label: '',  // could be either the city or listing's name
            _id: null,
            airbnb_id: null,
            revenue: 0,
            occupancy: 0,
            adr: 0
        }

        for (var label in Vector.adminDashboard.revenueByCity) {
            for (var key in Vector.adminDashboard.revenueByCity[label]) {
                var row = Object.assign({}, avgOccVsRevTemplate);

                row.label = label;
                if (Vector.selectedFilters) {

                    var onlyFilteredByCities = Vector.selectedFilters.hasOwnProperty('city') && Object.keys(Vector.selectedFilters).length == 1;
                    var multipleCitiesSelected = onlyFilteredByCities ? Vector.selectedFilters.city.length > 1 : false;
                    var showLinks = (onlyFilteredByCities && multipleCitiesSelected) ? false : true;

                    if (showLinks) {
                        var currentListing = Object.values(Vector.listings).find(function (l) {
                            return l.nickname == label;
                        });
                        if (currentListing) {
                            row._id = currentListing._id;
                            row.airbnb_id = currentListing.airbnb_id;
                        }
                    }
                }


                row.date = key;
                row.revenue = Vector.adminDashboard.revenueByCity[label][key]['revenue']||'0';
                row.occupancy = Vector.adminDashboard.revenueByCity[label][key]['occ']||'0';
                row.revpar = Vector.adminDashboard.revenueByCity[label][key]['revpar']||'0';
                row.adr = Vector.adminDashboard.revenueByCity[label][key]['adr']||'0';
                avgOccVsRev.push(row);
            }

        }

        $("#occRevTable").html("<h4 class='m-t-0 header-title'>Occupancy and Revenue</h4><table class='p-1 table w-100'></table>");
        $("#occRevTable").find("table").on("draw.dt", function (){
            setTimeout(function () {
                $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
            }, 200);
        }).DataTable({
            data: avgOccVsRev,
            dom: 'Bfrtip',
            buttons: {
                dom:{
                    container:{
                        className: "top-right-btn-container"
                    }
                },
                buttons:[{
                    extend: "csv",
                    className: "downloadCSV",
                    titleAttr: "Export in csv",
                    text: "<img src='../images/xls-logo.svg' >",
                    init: function(api, node, config) {
                        $(node).removeClass('btn btn-secondary buttons-html5')
                    }
                }]
            },
            columns: [
                {data: "date", title: "Date" , render: function ( data, type, row ) {
                        if ( type === 'filter') {
                            return moment(data).format('MMMM YYYY');
                        }
                        if (type === 'display') {
                            return moment(data).format('MMM-YY');
                        }
                        return data;
                    }},
                {data: "label", title:"Label", "render": function (data, type, row) {
                        if (type === 'display' && row._id !== null && row.airbnb_id !== null) {
                            var html = "<a target='_blank' href='https://app.guesty.com/listings/"+row._id+"/calendar'><i class='md md-camera'></i></a>" +
                                "<a href='http://www.airbnb.com/rooms/"+ row.airbnb_id+"' target='_blank' title='Visit AirBNB page of this listing'><img src='../images/airbnb-logo.png' height=16px>&nbsp;</a>"+
                                "<a href='javascript:Vector.showAdminListingPerformance(\""+row._id+"\");'>" +data+ "</a>";
                            return html;
                        }
                        return data;
                    }},
                {data: "revenue", title:"Revenue", "render": moneyFormatter},
                {data: "occupancy",title:"Occupancy", "render": renderPercentColumn},
                {data: "adr",title:"ADR", "render": moneyFormatter},
                {data: null ,title:"RevPAR", "render": function (data, type, row) {
                        return '$' + parseFloat(row.revpar).toFixed(2)
                    }},
            ]
        });
    },
    'showAdminDashboard': function() {
        if(Vector.adminDashboardNeedsUpdate) {
            Vector.adminDashboardNeedsUpdate=0;
            Vector.getAdminDashboard();
            return;
        }
        $(".rightContent").hide();
        Vector.moveFiltersTo('#adminDashboard');

        $("#adminDashboard_thismonthsrev").html((Vector.adminDashboard.stats.thisMonthsRev||0).moneyString());
        $("#adminDashboard_todaysrev").html((Vector.adminDashboard.stats.todaysRev||0).moneyString());
        $("#adminDashboard_todaysADR").html((Vector.adminDashboard.stats.todaysADR||0).moneyString());
        $("#adminDashboard_checkouts").html(Vector.adminDashboard.todaysCheckins.length+'/'+Vector.adminDashboard.stats.todaysCheckouts);

        $("#adminDashboard_cancelled").html(Vector.adminDashboard.stats.cancelled||0);
        $("#adminDashboard_cancelledRev").html((Vector.adminDashboard.stats.cancelledRev||0).moneyString());
        $("#adminDashboard_occupancy").html((100*parseFloat(Vector.adminDashboard.stats.todaysOccupancy)).toFixed(0)+'%');
        $("#adminDashboard_lostRev").html(Vector.adminDashboard.stats.numVacant+" / "+(Vector.adminDashboard.stats.lostRev||0).moneyString());

        Vector.generateAdminUrgentAlerts();
        Vector.generateNextYearAdrVsCompAdr();
        Vector.generateAdminRevenueByChannel();
        Vector.generateAdminLastYearRevenue();
        Vector.generateSameMonthRevenue();
        Vector.generateRevenueByCheckin();
        Vector.generateRevenueByBooking();

        var revChart = {
            labels: [],
            datasets: [
                {
                    label: "Revenue",
                    data: []
                }
            ]
        };
        Object.assign(revChart.datasets[0],app_configs.colors[0]);
/*
        var occChart=JSON.parse(JSON.stringify((revChart)));
        occChart.datasets.push({
            label:"Revenue",
            yAxisID:'A',
            fill:false,
            type:"line",
            data:[],
            borderColor: '#000',
            borderWidth: 1
        });
        revChart.datasets.push({
           label:"Occupancy",
           dataType:'percent',
           yAxisID: 'B',
           fill: false,
           type:"line",
           data:[],
            borderColor: '#000',
            borderWidth: 1
        }); */
      //  var occ_ds_template = { label: "Occupancy",data:[], dataType:'percent'};
        var ds_template = revChart.datasets[0];
        revChart.datasets.shift();
      //  occChart.datasets.shift();
     //   ds_template.yAxisID = 'A';
       // occ_ds_template.yAxisID='B';
        var totalcost=0;
        var totalmargin=0;
        Vector.resetColorIndex();
        var labels=[];
        var labelDates=[];
        for(var city in Vector.adminDashboard.revenueByCity) {
            var dsfurniture = JSON.parse(JSON.stringify(ds_template));
            var dslease = JSON.parse(JSON.stringify(ds_template));
            var dsutilities = JSON.parse(JSON.stringify(ds_template));
            var dsmargin = JSON.parse(JSON.stringify(ds_template));
            var smallcity=city.substr(0,10);

            dsfurniture.label = smallcity+' Furniture Cost';
            dsfurniture.legend = {display:false};
            dslease.label = smallcity+' Lease Cost';
            dslease.legend = {display:false};
            dsutilities.label = smallcity+' Utilities Cost';
            dsutilities.legend = {display:false};

            dsmargin.label= city;
            dsfurniture.stack = city;
            dslease.stack = city;
            dsutilities.stack = city;
            dsmargin.stack=city;

            for(var d in Vector.adminDashboard.revenueByCity[city]) {
                var dmoment = moment(d);
                if(labelDates.indexOf(d)==-1) labelDates.push(d);
                if(labels.indexOf(dmoment.format("MMM"))==-1)
                    labels.push(dmoment.format("MMM"));
                var rev = parseFloat(Vector.adminDashboard.revenueByCity[city][d].revenue||'0');
                var costs = Vector.getCost(city,dmoment);
                dsfurniture.data.push(costs.furniture);
                dslease.data.push(costs.lease);
                dsutilities.data.push(costs.utilities);
                totalcost+=costs.totalCost;
                dsmargin.data.push(rev-costs.totalCost);
                totalmargin+=(rev-costs.totalCost);
            }
            Object.assign(dsfurniture,{
                backgroundColor: "rgba(33, 33, 33, 0.7)",
                hoverBackgroundColor: "rgba(33, 33, 33, 0.7)"
            });
            Object.assign(dslease,{
                backgroundColor: "rgba(33, 33, 33, 0.7)",
                hoverBackgroundColor: "rgba(33, 33, 33, 0.7)"
            });
            Object.assign(dsutilities,{
                backgroundColor: "rgba(33, 33, 33, 0.7)",
                hoverBackgroundColor: "rgba(33, 33, 33, 0.7)"
            });
            Object.assign(dsmargin,Vector.getColor());

            if(user.role=='superadmin') {
                revChart.datasets.push(dslease);
                revChart.datasets.push(dsfurniture);
                revChart.datasets.push(dsutilities);
            }

            revChart.datasets.push(dsmargin);
        }
        revChart.labels=labels;
  /*      occChart.labels=labels;

        //calculate occupancies
        var occByDate = {};
        for(var l in labelDates) {
            occByDate[labelDates[l]]=0;
        }

        for(var d in Vector.adminDashboard.occupancyData) {
            var r = Vector.adminDashboard.occupancyData[d];
            for(var l in labelDates) {
                if(labelDates[l] in r) {
                    occByDate[labelDates[l]] += 0+parseFloat(r[labelDates[l]]||0);
                }
            }
        }

        for(var l in labelDates) {
            var count=0;
            for(var i in Vector.adminDashboard.occupancyData) {
                if(labelDates[l] in Vector.adminDashboard.occupancyData[i]) count++;
            }
            occByDate[labelDates[l]]/=count;
        }
        for(var o in occByDate) {
            revChart.datasets[0].data.push(100*occByDate[o]);
        }

*/
        $("#adminDashboardRevByCityChart").parent().html("<canvas id=\"adminDashboardRevByCityChart\" height=\"100\"></canvas>");

        $.ChartJs.respChart("adminDashboardRevByCityChart",'Bar',revChart,{
            chartTitle:'Revenue<br/>Cost: '+ totalcost.moneyString() +'&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Margin: '+totalmargin.moneyString(),
            scales: {
                yAxes: [{
                    id: 'A',
                    type: 'linear',
                    position: 'left',
                    ticks: {
                        min:0
                    }
                },
                {
                    id: 'B',
                    type: 'linear',
                    position: 'right',
                    ticks: {
                        max: 100,
                        min: 0
                    }
                }]
            },
            tooltips: {
                mode: 'x'
            },
            legend: {
                labels: {
                    boxWidth: 10,
                    fontSize: 10,
                    padding: 5,
                    filter: function(item, chart) {
                        // Logic to remove a particular legend item goes here
                        return !item.text.includes('Cost');
                    }
                }
            }
        });

        $("#occRevTable").prependTo("#occRevTableAdmin");
        Vector.setupOccupancyAndRevenueTable();

        if (typeof(Vector.adminDashboard.lastYearRevPar) !== 'undefined' && Vector.adminDashboard.lastYearRevPar.length > 0) {
            var monthsTemplate = [];
            var dataTemplate = [];
            var labels = [];
            var auxMonth = moment().subtract(12, 'M');
            var i = 0;
            for (i; i < 12; i++, auxMonth.add(1, 'M')) {
                dataTemplate.push(0);
                monthsTemplate.push(auxMonth.format('Y-MM'));
                labels.push(auxMonth.format('Y-MMM'));
            }

            Vector.resetColorIndex();
            var color = Vector.getColor();
            var revParDatasets = [];
            var revParSource = {
                label: Vector.adminDashboard.lastYearRevPar[0].label,
                data: dataTemplate.slice(),
                fill: false,
                lineTension: 0,
                borderColor: color.backgroundColor,
                borderWidth: 1
            };


            Object.assign(revParSource, color);

            Vector.adminDashboard.lastYearRevPar.forEach(function (source) {
                if (revParSource.label != source.label) {
                    revParDatasets.push(Object.assign({}, revParSource));
                    color = Vector.getColor();
                    revParSource.borderColor = color.backgroundColor;
                    revParSource.label = source.label,
                    revParSource.data = dataTemplate.slice();
                    Object.assign(revParSource, color);
                }
                i = monthsTemplate.indexOf(source.month);
                revParSource.data[i] = parseFloat(source.revPar);
            });

            revParDatasets.push(revParSource);

            var revParChart = {
                labels : labels,
                datasets: revParDatasets
            };

            $("#adminRevParChartContainer").html("<canvas id=\"adminRevParChart\" height=\"100\"></canvas>");
            $.ChartJs.respChart("adminRevParChart",'Line',revParChart,{
                chartTitle:'Last 12 Month Rev Par',
                tooltips: {
                    mode: 'index',
                    intersect: false
                },
            });
        }

       // Vector.generateRentProjectionTable();

        $("#unavailableDatesTable").html("<h4 class='m-t-0 header-title'>Unavailable Dates</h4><table class='p-1 table w-100'></table>");
        $("#unavailableDatesTable").find("table").on("draw.dt", function (){
            setTimeout(function () {
                $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
            }, 200);
            }).DataTable({
            sScrollX: "100%",
            sScrollXInner: "110%",
            bScrollCollapse: true,
            data:Vector.adminDashboard.unavailableDates,
            columns: [
                {data: "nickname",title:"name","fnCreatedCell": Vector.guestyListingDatatableLink},
                {data: "address_city",title:"city"},
                {data: "date",title:"date"},
            ]
        });

        var downLinks = Object.values(Vector.listings).filter(function(listing) {
            return listing.active && listing.airbnbDownAt !== null;
        });
        $("#downLinksTable").html("<h4 class='m-t-0 header-title'>Down Links</h4><table class='p-1 table w-100'></table>");
        $("#downLinksTable").find("table").on("draw.dt", function (){
            setTimeout(function () {
                $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
            }, 200);
            }).DataTable({
            sScrollX: "100%",
            sScrollXInner: "110%",
            bScrollCollapse: true,
            dom: 'Bfrtip',
            buttons: {
                dom:{
                    container:{
                        className: "top-right-btn-container"
                    }
                },
                buttons:[{
                extend: "csv",
                className: "downloadCSV",
                titleAttr: "Export in csv",
                text: "<img src='../images/xls-logo.svg' >",
                init: function(api, node, config) {
                    $(node).removeClass('btn btn-secondary buttons-html5')
                 }
                }]
            },
            data: downLinks,
            columns: [
                {data: "nickname", title:"name","render": function(data, type, row) {
                    if (type === 'sort' || type === 'filter') {
                        return data;
                    }
                    return "<a href='javascript:Vector.showAdminListingPerformance(\""+row._id+"\");'>"+
                    data+"</a>"
                }},
                {data: "airbnbDownAt", title:"status", "render": function (data, type, row) {
                    return data !== null ? 'inactive' : 'active';
                }},
                {data: "airbnbDownAt", title:"last active date", "render": function (data, type, row) {
                    return data ? data : 'n/a'
                }},
                {data: "airbnb_id", title:"link", "render": function (data, type, row) {
                    return "<a target='_blank' href='https://www.airbnb.com/rooms/"+data+"'>https://www.airbnb.com/rooms/"+data+"</a>";
                }}
            ]
        });

        $("#adminDashboard").show();
    },
    'deactivateListing': function(airbnb_id) {
      api({airbnb_id:airbnb_id});
    },
    'recheckListing': function(airbnb_id) {
        api({airbnb_id:airbnb_id});
    },
    'generateAdminUrgentAlerts': function() {
      if ('urgentAlerts' in Vector.adminDashboard && Vector.adminDashboard.urgentAlerts.length>0) {
        let unreachableArray = [];
        $("#adminUrgentAlertsTable").html("<h4 class='m-t-0 header-title'>Unreachable Listings</h4><table class='p-1 table w-100'></table>");
        for(var i in Vector.adminDashboard.urgentAlerts) {
            var ui = Vector.adminDashboard.urgentAlerts[i];
            switch(ui.type) {
                case 'unreachable':
                    unreachableArray.push(ui);
                    break;
                default:
                    break;
            }
        }
        $("#adminUrgentAlertsTable").find("table").on("draw.dt", function (){
            setTimeout(function () {
                $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
            }, 200);
        }).DataTable({
            sScrollX: "100%",
            sScrollXInner: "110%",
            bScrollCollapse: true,
            data:unreachableArray,
            columns: [
                {data: "nickname",title:"name","fnCreatedCell": Vector.guestyListingDatatableLink},
                {data: "address_city",title:"city"},
                {data: "date",title:"date"},
                {data: "airbnb_id", title:"action", "fnCreatedCell": Vector.dataTable_deactivateOrRecheckButtons}
            ]
        });
        $("#adminUrgentAlertsTable").show();
      }
    },
    'dataTable_deactivateOrRecheckButtons': function(nTd, sData, oData, iRow, iCol) {
        $(nTd).html(
            "<div class='btn-toolbar form-group row' style='width:220px;'>"+
            "<div style='width:100px; margin:5px;'><button class='btn btn-default waves-effect waves-light form-control' onClick='Vector.deactivateListing("+oData.airbnb_id+"); $(this).parent().parent().parent().parent().remove();'>Deactvate</button></div>" +
            "<div style='width:100px; margin:5px;'><button class='btn btn-default waves-effect waves-light form-control' onClick='Vector.recheckListing("+oData.airbnb_id+"); $(this).parent().parent().parent().parent().remove();'>Recheck</button></div>"+
            "</div>"
        );
    },
    'generateNextYearAdrVsCompAdr': function() {
        bnbtrackerapi({method:'get12MonthAdrVsCompAdr'}, function (response) {
                var avgVscompTable = [];
                var cols = [];

                cols.push({
                    data: "nickname",
                    title: "Name",
                    "render": function ( data, type, row ) {
                        if (type === 'sort') {
                            if (data.startsWith('Comp set: ')) {
                                return data.slice(10, -1);
                            }
                        }
                        return data;
                    }
                });

                for (var i = 0; i < 12; i++) {
                    var month = moment().add(i, 'M');
                    cols.push({
                        data: month.format('YYYY-MM'),
                        title: month.format('MMM'),
                        "render" : moneyFormatter
                    });
                }

                for (var i in Vector.listings) {
                    var found = false;
                    var listing = {
                        nickname : Vector.listings[i].nickname,
                    };
                    var comp = {
                        nickname : 'Comp set: ' + Vector.listings[i].nickname,
                    }
                    for(var j in response) {
                        if (Vector.listings[i].airbnb_id == response[j].listing_id) {
                            found = true;
                            var currentMonth = response[j].yearmonth;
                            listing[currentMonth] = response[j].adr;
                            comp[currentMonth] = response[j].compadr;
                        }
                    }

                    if (found) {
                        avgVscompTable.push(listing);
                        avgVscompTable.push(comp);
                    }
                }
                $("#nextYearAvgVsCompAdr").html("<h4 class='m-t-0 header-title'>Next 12 Months ADR Vs Comparable Averages</h4><table class='p-1 table w-100'></table>");
                $("#nextYearAvgVsCompAdr").find("table").DataTable({
                    data: avgVscompTable,
                    columns: cols
                });
            });
    },
    'getAnalyticsVsComparablesTableData': function(bnbTrackerResponse, apiResponse) {
        var tableData = apiResponse;
        var averages = {
            first: 1,
            nickname: 'Averages',
            adr: 0,
            occ: 0,
            rev: 0,
            compdata: {
              compadr: 0,
              comprev: 0,
              compop: 0,
              avgdelta: 0,
              avgrevdelta: 0
            }
        }

        for (var j in tableData) {
            var compdata = {
                compadr: undefined,
                comprev: undefined,
                compop: undefined,
                avgdelta: undefined,
                avgrevdelta: undefined
            }
            averages.adr += tableData[j].adr !== 'n/a' ? parseFloat(tableData[j].adr) : 0;
            averages.occ += !isNaN(tableData[j].occ) ? parseFloat(tableData[j].occ) : 0;
            averages.rev += !isNaN(tableData[j].rev) ? parseFloat(tableData[j].rev) : 0;
            tableData[j]['compdata'] = compdata;
            tableData[j]['first'] = 0;

            for(var i in bnbTrackerResponse) {
                if(tableData[j].airbnb_id == bnbTrackerResponse[i].listing_id) {
                        tableData[j].compdata.compadr =  bnbTrackerResponse[i].compadr;
                        tableData[j].compdata.comprev = bnbTrackerResponse[i].comprev;
                        tableData[j].compdata.compop = bnbTrackerResponse[i].compop;
                        tableData[j].compdata.avgrevdelta = parseFloat(tableData[j].rev) - parseFloat(bnbTrackerResponse[i].comprev);
                        if (tableData[j].adr !== 'n/a') {
                            tableData[j].compdata.avgdelta = parseFloat(tableData[j].adr)/parseFloat(bnbTrackerResponse[i].compadr) - 1;
                        }
                        for (var k in tableData[j].compdata) {
                            if (!isNaN(parseFloat(tableData[j].compdata[k]))) {
                                averages.compdata[k] += parseFloat(tableData[j].compdata[k]);
                            }
                        }
                    break;
                }
            }
        }

        averages.adr /= tableData.length;
        averages.occ /= tableData.length;
        averages.rev /= tableData.length;
        averages.compdata.compadr /= tableData.length;
        averages.compdata.comprev /= tableData.length;
        averages.compdata.compop /= tableData.length;
        averages.compdata.avgdelta /= tableData.length;
        averages.compdata.avgrevdelta /= tableData.length;

        tableData.unshift(averages);

        return tableData;
    },
    'generateOccupancyVsCompAvgTable': function() {
      bnbtrackerapi(
          {
              method:'getOccupancyComparisonData',
              listing_id: Vector.selectedProperty
          },
          function (response) {
              var occupancyVsCompAVGTable = Vector.getAnalyticsVsComparablesTableData(
                  response.analyticsVsComparables,
                  Vector.adminDashboard.occupancyAnalytics.analyticsVsComparables
              )
              $("#occupancyVsCompAVGTable").html("<h4 class='m-t-0 header-title'>Comp Set Comparison</h4><br><br><table class='p-1 table w-100'></table>");
              $("#occupancyVsCompAVGTable").find("table").DataTable({
                    dom: 'Bfrtip',
                    buttons: [ 'copy', 'csv', 'excel', 'pdf', 'print' ],
                    data: occupancyVsCompAVGTable,
                    columns: [
                        {data: "first", title: "first"},
                        {data: "nickname", title: "listing_id", "fnCreatedCell": Vector.guestyListingDatatableAirbnbLink},
                        {data: "adr", title: "ADR", "render":moneyFormatter},
                        {data: "rev", title: "Revenue", "render":moneyFormatter},
                        {data: "occ", title: "Occupancy", "render":renderPercentColumn},
                        {data: "compdata.compadr", title: "AVG Comp ADR", "render":moneyFormatter},
                        {data: "compdata.comprev", title: "AVG Comp Revenue", "render":moneyFormatter},
                        {data: "compdata.compop", title: "AVG Comp Occupancy", "render":renderPercentColumn},
                        {data: "compdata.avgdelta", title: "ADR Delta %", "render":renderPercentColumn},
                        {data: "compdata.avgrevdelta", title: "Avg Rev Delta", "render":moneyFormatter},
                    ],
                    columnDefs: [
                        {
                            targets: [0],
                            visible: false,
                            searchable: false
                        }
                    ],
                    order: [
                        [0, "desc"],
                        [1, "asc"]
                    ]
              });

              var next30AnalyticsVsComparables = Vector.getAnalyticsVsComparablesTableData(
                response.next30,
                Vector.adminDashboard.occupancyAnalytics.next30
            )
              $("#occupancyVsCompAVGTableNext30").html("<h4 class='m-t-0 header-title'>Next 30 Day Analytics Vs Comparable Averages</h4><br><br><table class='p-1 table w-100'></table>");
              $("#occupancyVsCompAVGTableNext30").find("table").DataTable({
                    dom: 'Bfrtip',
                    buttons: [ 'copy', 'csv', 'excel', 'pdf', 'print' ],
                    data: next30AnalyticsVsComparables,
                    columns: [
                        {data: "first", title: "first"},
                        {data: "nickname", title: "listing_id", "fnCreatedCell": Vector.guestyListingDatatableAirbnbLink},
                        {data: "adr", title: "ADR", "render":moneyFormatter},
                        {data: "rev", title: "Revenue", "render":moneyFormatter},
                        {data: "occ", title: "Occupancy", "render":renderPercentColumn},
                        {data: "compdata.compadr", title: "AVG Comp ADR", "render":moneyFormatter},
                        {data: "compdata.comprev", title: "AVG Comp Revenue", "render":moneyFormatter},
                        {data: "compdata.compop", title: "AVG Comp Occupancy", "render":renderPercentColumn},
                        {data: "compdata.avgdelta", title: "ADR Delta %", "render":renderPercentColumn},
                        {data: "compdata.avgrevdelta", title: "Avg Rev Delta", "render":moneyFormatter},
                  ],
                  columnDefs: [
                    {
                        targets: [0],
                        visible: false,
                        searchable: false
                    }
                ],
                order: [
                    [0, "desc"],
                    [1, "asc"]
                ]
              });
          }
      );
    },
    'generateOccupancyLookaheadTable': function(a,date) {

        var excludeUnaciveListings = $("#occupancy_excludeInactiveListings").is(":checked");
        var matchingRows = Vector.adminDashboard.occupancyLookahead.filter(function (row) {
                    var onlyActive = excludeUnaciveListings == (row.active && row.isListed);
                   return excludeUnaciveListings ? onlyActive : true;
               });

        $("#occupancyLookaheadTable").html("<table class='p-1 table w-100'></table>");
        $("#occupancyLookaheadTable").find("table").DataTable({
                dom: 'Bfrtip',
                buttons: [ 'copy', 'csv', 'excel', 'pdf', 'print' ],
                data:matchingRows,
                order:[[1,"asc"]],
                columns: [
                    {data: "nickname",title:"name", "fnCreatedCell": Vector.guestyListingDatatableAirbnbLink},
                    {data: "address_city",title:"city"},
                //    {data: "7dayDelta",title:"7dayDelta", "render":renderPercentColumn},
                    {data: "7day",title:"7day",  "render":renderPercentColumn},
                //   {data: "7day_specific",title:"7day "+(date?("on "+date):" last year"),  "render":renderPercentColumn},
                    {data: "30day",title:"30day", "render":renderPercentColumn},
                // {data: "30day_specific",title:"30day "+(date?("on "+date):" last year"),  "render":renderPercentColumn},
                    {data: "60day",title:"60day", "render":renderPercentColumnNoWarnings},
                // {data: "60day_specific",title:"60day "+(date?("on "+date):" last year"),  "render":renderPercentColumn},
                    {data: 'cleaningFee', title:'cleaning', render: moneyFormatter},
                    {data: 'tonightsPrice', title:'price tonight', render:moneyFormatter},
                    {data: 'vacantPrice', title:'vacant price', render:moneyFormatter}
                ]
            });

    },
    'saveListing': function() {
        var id = Vector.selectedListingId;
        Vector.listings[id].leaseType = $("#leaseType")[0].selectedIndex;
        Vector.listings[id].leaseCost = $("#leaseCost").val();
        Vector.listings[id].furnitureCost = $("#furnitureCost").val();
        Vector.listings[id].utilitiesCost = $("#utilitiesCost").val();
        Vector.listings[id].leaseStartDate = $("#leaseStartDate").val();
        Vector.listings[id].fixedManagementFee = $("#fixedManagementFee").val();
        Vector.listings[id].percentManagementFee = $("#percentManagementFee").val();

        api({method:'updateListing',
            listingId: id,
            leaseType:     Vector.listings[id].leaseType,
            leaseCost:     Vector.listings[id].leaseCost,
            furnitureCost: Vector.listings[id].furnitureCost,
            utilitiesCost: Vector.listings[id].utilitiesCost,
            leaseStartDate: Vector.listings[id].leaseStartDate,
            fixedManagementFee: Vector.listings[id].fixedManagementFee,
            percentManagementFee: Vector.listings[id].percentManagementFee
        },function() {},true);
    },
    'showAdminListingPerformance': function(id) {
        $(".tab-pane").each(function (index, element) {
            $(element).removeClass("show active");
        });
        $(".rightContent").hide();
        $("#userListingPerformanceContainer").prependTo("#adminListingPerformance");
        if(id) Vector.selectedListingId=id;
        else id=Vector.selectedListingId;

        //gets the summary data and fills the reservation table below the calendar
        Vector.getReservationData();

        Vector.showReviewsCharts(id);

        var foundListing=0;
        for(var i in Vector.bnbtrackerProperties) {
            if(Vector.bnbtrackerProperties[i].id == Vector.listings[Vector.selectedListingId].airbnb_id) {
                foundListing = Vector.bnbtrackerProperties[i];
                break;
            }
        }
        if(foundListing) {
            Vector.getCompList(foundListing);
        }
        else {
            alert("Could not find bnbtracker property with this id to fill comp tracker. Please try reloading.");
            //Vector.getCompList(Vector.listings[Vector.selectedListingId]);
        }
        $('#unitPerformanceCalendar').fullCalendar('gotoDate',Vector.startDateFilter.clone());
        //call active tab
        $("#adminListingTabs").find(".nav-link").removeClass("active show");
        $("#adminListingTabs").find(".nav-link").first().addClass("active show");
        $("#adminListingPerformance").addClass("active show");



        $("#adminListingTabs").show();
        $($("#leaseType option")[Vector.listings[id].leaseType]).attr("selected",true);
        $("#leaseCost").val(Vector.listings[id].leaseCost);
        $("#furnitureCost").val(Vector.listings[id].furnitureCost);
        $("#utilitiesCost").val(Vector.listings[id].utilitiesCost);
        $("#leaseStartDate").val(Vector.listings[id].leaseStartDate);
        var options = Array.from($(".listingSelect").find("option"));
        options.forEach(function (option) {
            if (option.value == Vector.selectedListingId) {
                option.setAttribute("selected", true);
                return;
            }
        });

        //incase calendar needs reloading
        $('#unitPerformanceCalendar').fullCalendar('render');
        $('#unitPerformanceCalendar').fullCalendar('refetchEvents');
    },

    'getListing': function (id) {
        return Object.values(Vector.listings).find(function (l) { return l._id == id});
    },

    'showReviewsCharts': function (id) {
        var listing = Vector.getListing(id),
        chartTitle,
        chartWrapper,
        hasReviews = function (response) {
            return response.hasOwnProperty('reviews') && response.reviews.length > 0;
        },
        cleanWrapperAndHideRow = function (wrapper) {
            $(wrapper).html('').closest('.row').hide();
        };

        api({method:'getReservationReviewsForListing', listingId: id}, function (response) {
            chartWrapper = '#reservationReviewsChartContainer';
            if (!hasReviews(response)) {
                cleanWrapperAndHideRow(chartWrapper);
                return;
            }
            chartTitle = listing.nickname + ' Reservation Reviews by Check-Out';
            Vector.generateReviewChart(chartWrapper, chartTitle, response.reviews);
        });

        api({method:'getListingReviews', listingId: id}, function (response) {
            chartWrapper = '#listingReviewsChartContainer';
            if (!hasReviews(response)) {
                cleanWrapperAndHideRow(chartWrapper);
                return;
            }
            chartTitle = listing.nickname + ' Reviews';
            Vector.generateReviewChart(chartWrapper, chartTitle, response.reviews);
        });
    },

    'generateReviewChart': function (wrapper, title, reviews) {
        var labels = [],
            metrics = ['Overall', 'Accuracy', 'Cleanliness', 'Communication', 'Check-In', 'Location', 'Value'],
            datasets,
            chartData,
            chartId = title.replace(/\s/g, '');

        Vector.resetColorIndex();
        datasets = metrics.reduce(function (datasetBuffer, metric) {
            var color = Vector.getColor();
            var dataset = {
                label: metric,
                data: [],
                dataType: 'amount',
                fill: false,
                lineTension: 0,
                borderColor: color.backgroundColor,
            }
            datasetBuffer.push(Object.assign(dataset, color));
            return datasetBuffer;
        }, []);

        reviews.forEach(function (review) {
            labels.push(moment(review.dateCriteria).format('MMM D'));
            datasets.forEach(function (dataset) {
                dataset.data.push(review[dataset.label]);
            });
        });

        chartData = {
            labels: labels,
            datasets: datasets
        };

        $(wrapper).closest('.row').show();
        $(wrapper).html('<canvas id=\"' + chartId + '\"></canvas>');
        $.ChartJs.respChart(chartId, 'Line', chartData,
            {
                chartTitle: title,
                tooltips: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    yAxes: [{
                        type: 'linear',
                        ticks: {
                            min: 1,
                            max: 5,
                            stepSize: 1
                        }
                    }]
                }
            }
        );
    },

    'addAirBnbComps': function(airbnbIds) {
        var modal = $('#addCompsFromAirbnb');

        if(Array.isArray(airbnbIds) && airbnbIds.length > 0) {
            selectCompForListing(airbnbIds, selectedProperty);
            setTimeout(function() {
                Vector.getCompList(selectedProperty);
            },10000);
            modal.find('input#airbnbIds').tagsinput('removeAll');
            modal.modal('toggle');
        } else {
            window.alert("The input cannot be empty. Enter the ID from airbnb url like \nhttps://www.airbnb.com/rooms/{copy paste this number}");
            return false;
        }
    },

    'fillCompTracker': function() {
        if(Vector.needToRefreshCompList) {
            var propertyIds = [selectedProperty.id];
            for(var i in selectedComps) {
                propertyIds.push(selectedComps[i].id);
            }
            showLoading("#compTracker");
            $("#compTracker").show();
            Vector.getCompList(selectedProperty,function() {
                Vector.fillCompTracker();
            });
            return;
        }
        var weekly_price_factor,monthly_price_factor;
        var html="<div id='comptrackertab   lediv' style='overflow-y:auto; overflow-x:visible; min-width:100%; height:100%;'>";
        var tableheaddeclaration = "<table class='compTrackerTable' align='left'><thead>"+
            "<tr><th>#</th><th style='min-width:108px;'>Photo</th><th style='min-width:150px; max-width:150px;'>Comp Name</th><th>Last Updated</th><th>Reviews</th>"+
            "<th>Stars</th><th>Guests</th><th>Bedrooms</th><th>Beds</th><th>Bath</th><th>Min Nights</th>"+
            "<th style='width:106px;'>Type</th><th>Cancellation Policy</th><th>Picture Count</th><th>Cleaning Fee</th><th>Security Deposit</th>"+
            "<th>Check-In-Time</th><th>Check-Out-Time</th><th>Weekly Discount</th><th>Monthly Discount</th></tr></thead><tbody>";

        html+=tableheaddeclaration;
        html = "</table></div>"+html;

        var trackedProperties = [selectedProperty].concat(selectedComps);
        for(var i in trackedProperties) {
            var c = trackedProperties[i];
            weekly_price_factor = parseFloat(c.weekly_price_factor);
            monthly_price_factor = parseFloat(c.monthly_price_factor);
            if(isNaN(weekly_price_factor) || weekly_price_factor==0) { weekly_price_factor = "0%"; }
            else weekly_price_factor = (100*(1-weekly_price_factor)).toFixed(0)+"%";
            if(isNaN(monthly_price_factor)|| monthly_price_factor==0) { monthly_price_factor = "0%"; }
            else monthly_price_factor = (1-monthly_price_factor).toFixed(0)+"%";

            c.calendar_updated_at = c.calendar_updated_at?c.calendar_updated_at.replace("ago",""):'';
            html+="<tr><td>"+ (parseInt(i)+1) +"</td>"+
                "<td><a href='http://www.airbnb.com/rooms/"+c.id+"'><img src='"+ c.thumbnail_url+"' style='height: 60px;'></a></td>"+
                "<td>"+ c.name +"</td>"+
                "<td>"+ c.calendar_updated_at +"</td>"+
                "<td>"+ c.reviews_count+"</td>"+
                "<td>"+ c.star_rating+"</td>"+
                "<td>"+ c.person_capacity+"</td>"+
                "<td>"+ parseInt(c.bedrooms) +"</td>"+
                "<td>"+ parseInt(c.beds)+"</td>"+
                "<td>"+ parseInt(c.bathrooms)+"</td>"+
                "<td>"+ c.min_nights+"</td>"+
                "<td>"+ c.property_type+"</td>"+
                "<td style='text-transform:capitalize;'>"+ c.cancellation_policy+"</td>"+
                "<td>"+ c.picture_count+"</td>"+
                "<td>"+ c.cleaning_fee_native+"</td>"+
                "<td>"+ c.security_deposit_native+"</td>" +
                "<td>"+ ((!c.check_in_time)?"":moment().hour(c.check_in_time).format("h a"))+"</td>"+
                "<td>"+ ((!c.check_out_time)?"":moment().hour(c.check_out_time).format("h a"))+"</td>"+
                "<td>"+ weekly_price_factor +"</td>" +
                "<td>"+ monthly_price_factor +"</td>" +
                "</tr>";
        }
        html+="</tbody></table></div>";
        $("#compTracker").html(html).show();

        $("#comptrackeroverlay table th").click(function() {
            $("#comptrackertablediv table th:nth-child("+($(this).index()+1)+")").click();
        });
        $("#comptrackeroverlay table").css("width",$("#comptrackertablediv table").width());
        $("#comptrackertablediv").css("width",$("#comptrackertablediv table").width());
    },

    'getPriceLabsSettings': function (listingId) {
        api({listingId:listingId}, function(data) {
            var inputs = $('#priceLabsSettingsForm :input');
            $.each(inputs, function (i, input) {
                $input = $(input);
                $input.val(data.listings[0][$input.attr('name')]);
            });
        });
    },

    'setPriceLabsSettings': function () {
        var data = {
            id: Vector.selectedListingId,
            pms: 'guesty'
        };

        var inputs = $('#priceLabsSettingsForm :input');
        $.each(inputs, function (i, input) {
            if (input.name) {
                $input = $(input);
                data[$input.attr('name')] = $input.val() == '' ? null : Number.parseInt($input.val());
            }
        });

        api({listing: data}, function (response) {
            if ('error' in response) {
                alert(response.error.message);
                Vector.showAdminDashboard();
            }
        })
    },

    'thumbnailLink': function (nTd, sData, oData, iRow, iCol) {
        if (oData.hasOwnProperty('picture')) {
            var p = oData;
        } else {
            var p = Vector.listings[oData.listingId] || Vector.inactiveListings[oData.listingId];
        }
        if(p) {
            $(nTd).html("<img src='" + p.picture + "' style='width:60px;'/>").css("width","60");
        }
    },

    'sourceCell': function (nTd, sData, oData, iRow, iCol) {
        var source = oData.source;
        var logo = '';
        switch (source) {
            case 'Airbnb': {
                logo = '<img src="../images/airbnb-logo.png" style="margin-right:0.5em" height=16>';
            }; break;
            case 'Expedia': {
                logo = '<img src="../images/expedia-logo.png" style="margin-right:0.5em" height=16>';
            }; break;
            case 'Booking.com': {
                logo = '<img src="../images/booking-logo.png" style="margin-right:0.5em" height=16>';
            }; break;
            case 'HomeAway': {
                logo = '<img src="../images/homeaway-logo.png" style="margin-right:0.5em" height=16>';
            }; break;
            default: {
                logo = 'other';
            }
        }

        $(nTd).css('text-align', 'center').html(logo);
    },

    'guestyGuestDatatableLink': function (nTd, sData, oData, iRow, iCol) {
        $(nTd).html("<a target='_blank' href='https://app.guesty.com/reservations/"+oData._id+"/summary'><i class='md md-camera'></i></a> "+
            "<a href='http://www.airbnb.com/rooms/"+oData.airbnb_id+"' target='_blank' title='Visit AirBNB page of this listing'><img src='../images/airbnb-logo.png' height=16px>&nbsp;</a>"+
            "<a target='_blank' href='"+oData.guestUrl+"'>"+oData.firstName+" "+oData.lastName+"</a>");
    },

    'guestyReservationDatatableLink': function (nTd, sData, oData, iRow, iCol) {
        $(nTd).html("<a target='_blank' href='https://app.guesty.com/reservations/"+oData._id+"/summary'><i class='md md-camera'></i></a> "+
        "<a href='http://www.airbnb.com/rooms/"+oData.airbnb_id+"' target='_blank' title='Visit AirBNB page of this listing'><img src='../images/airbnb-logo.png' height=16px>&nbsp;</a>"+
            "<a href='javascript:Vector.showAdminListingPerformance(\""+oData.listingId+"\");'>"+
            oData.nickname+"</a>");
    },

    'guestyReservationDatatablePicture': function (nTd, sData, oData, iRow, iCol) {
        $(nTd).html("<img src='"+oData.picture+"' class='img-thumbnail listing-thumbnail' />");
    },
    'guestyListingDatatableLink': function (nTd, sData, oData, iRow, iCol) {
        var name = oData.nickname;
        if (name == '') name = oData.title;
        if (name == '') name = oData.address_full;
        $(nTd).html("<a target='_blank' href='https://app.guesty.com/listings/" + oData._id + "/calendar'><i class='md md-camera'></i></a>" +
            (Vector.isAdmin()?
                ("<a href='javascript:Vector.showAdminListingPerformance(\"" + oData._id + "\");'>" + name + "</a>"):
                ("<a href='javascript:Vector.showUserListingPerformance(\"" + oData._id + "\");'>" + name + "</a>")
            )
        );
    },
    'guestyListingDatatableAirbnbLink': function (nTd, sData, oData, iRow, iCol) {
        var name = oData.nickname;
        if(name=='') name = oData.title;
        if(name=='') name = oData.address_full;
        if (oData.hasOwnProperty('first') && oData.first) {
            $(nTd).html("<b>" + name + "</b>");
            return;
        }
        $(nTd).html("<a target='_blank' href='https://app.guesty.com/listings/"+oData._id+"/calendar'><i class='md md-camera'></i></a>" +
        "<a href='http://www.airbnb.com/rooms/"+ oData.airbnb_id+"' target='_blank' title='Visit AirBNB page of this listing'><img src='../images/airbnb-logo.png' height=16px>&nbsp;</a>"+
        "<a href='javascript:Vector.showAdminListingPerformance(\""+oData._id+"\");'>"+name+"</a>");
    },

    'updateListing': function(newvalue, listingId, colIndex) {
        switch(colIndex) {
            case 4:
                api({listingId:listingId,leaseCost:newvalue},false,1);
                if(listingId in Vector.listings)
                    Vector.listings[listingId].leaseCost=newvalue;
                if(listingId in Vector.inactiveListings)
                    Vector.inactiveListings[listingId].leaseCost=newvalue;
                break;
            case 5:
                api({listingId:listingId,utilitiesCost:newvalue},false,1);
                if(listingId in Vector.listings)
                    Vector.listings[listingId].utilitiesCost=newvalue;
                if(listingId in Vector.inactiveListings)
                    Vector.inactiveListings[listingId].utilitiesCost=newvalue;
                break;
            case 6:
                api({listingId:listingId,furnitureCost:newvalue},false,1);
                if(listingId in Vector.listings)
                    Vector.listings[listingId].furnitureCost=newvalue;
                if(listingId in Vector.inactiveListings)
                    Vector.inactiveListings[listingId].furnitureCost=newvalue;
                break;
            case 7:
                api({listingId:listingId,leaseStartDate:newvalue},false,1);
                if(listingId in Vector.listings)
                    Vector.listings[listingId].leaseStartDate=newvalue;
                if(listingId in Vector.inactiveListings)
                    Vector.inactiveListings[listingId].leaseStartDate=newvalue;
                break;
        }
    },
    'addUpdateInputField': function(e) {
        var id = e.data.id;
        var iCol = e.data.iCol;
        $(this).html("<input style='width:90px;' onChange='Vector.updateListing(this.value,\""+id+"\","+iCol+");$(this).parent().click({id:\""+id+"\",iCol:"+iCol+"},Vector.addUpdateInputField);$(this).parent().html(this.value);' value='"+$(this).html()+"'>");
        $(this).off();
    },

    'showAdminListings': function () {
        $(".rightContent").hide();

        $("#adminListings").show();
    },

    'updateReservationReviewsSelect': function (event) {
        var unit = $(event.target).val();
        $('.reservationField').html('');
        var html = "<option class='dropdown-item' value='default'>Reservation selection</option>";
        var select= $('#adminReservationReviewsReservationSelect');
        var data = {
            mode: 'admin',
            method: 'getReservationData',
            filters: JSON.stringify({unit:[unit]}),
            start: '1999-01-01',
            end: moment().format('YYYY-MM-DD')
        };

        api(data, function (response) {
            response.reservations.reverse().forEach(function (r) {
                html+="<option class='dropdown-item' value='" + r._id+ "'>" + r.firstName + ' ' + r.lastName + ': ' + r.checkIn + ' / ' + r.checkOut +  "</option>";
            });
            select.html(html);
            select.selectpicker({noneSelectedText: 'Reservation selection'});
            select.val('default');
            select.selectpicker('refresh');
        });
    },

    'updateRevationReviewsFields': function (event) {
        var select = $(event.target);
        var inputs = select.closest('tr').find('td.reservationField');
        inputs.val('');
        var optionText = select.find('option:selected').html();
        fieldsArray = optionText.match(/^(.+):\s(.{10})\s\/\s(.{10})$/);

        var fields = {
            guest: fieldsArray[1],
            checkIn: fieldsArray[2],
            checkOut: fieldsArray[3]
        };

        for (var field in fields) {
            $('.' + field).html(fields[field]);
        }
    },

    'showAdminScorecard': function() {
        $(".rightContent").hide();
        $("#AdminDashboardFilters").prependTo("#adminScorecard");
        api({method:'getReviewsData'}, function(response) {

            var count=0;
            var location=0;
            var starsOverall = 0;
            var accuracy = 0;
            var checkin = 0;
            var cleanliness = 0;
            var communication = 0;
            var valuecount = 0;


            for(var i in response.reservationReviews) {
                let r = response.reservationReviews[i];
                location         += parseInt(r['location']['stars']);
                starsOverall     += parseInt(r['starsOverall']);
                accuracy         += parseInt(r['accuracy']['stars']);
                cleanliness      += parseInt(r['cleanliness']['stars']);
                communication    += parseInt(r['communication']['stars']);
                checkin          += parseInt(r['checkIn']['stars']);
                valuecount       += parseInt(r['value']['stars']);
                count++;
            }

            location/=count;
            starsOverall/=count;
            accuracy/=count;
            cleanliness/=count;
            communication/=count;
            checkin/=count;
            valuecount/=count;


            $("#scorecard_reviewcount").html(count);
            $("#scorecard_location").html(location.toFixed(2));
            $("#scorecard_staravg").html(starsOverall.toFixed(2));
            $("#scorecard_accuracy").html(accuracy.toFixed(2));
            $("#scorecard_checkin").html(checkin.toFixed(2));
            $("#scorecard_communication").html(communication.toFixed(2));
            $("#scorecard_cleanliness").html(cleanliness.toFixed(2));
            $("#scorecard_value").html(valuecount.toFixed(2));

            $("#adminScorecard").show();

            if (typeof(response.reviewAveragesByMonth) !== 'undefined' && response.reviewAveragesByMonth.length > 0) {
                var dataTemplate = [];
                var labels = [];

                response.reviewAveragesByMonth.forEach(function(source) {
                    labels.push(moment(source.label).format('Y-MMM'));
                    dataTemplate.push(0);
                });

                var reviewDatasets = [];
                var datasetTemplate = {
                    fill: false,
                    lineTension: 0,
                    borderWidth: 1,
                    dataType: 'float'
                };

                Vector.resetColorIndex();

                var datasetNames = ["Overall","Accuracy","Cleanliness","Communication","CheckIn","Location","Value"];
                datasetNames.forEach(function(datasetName) {
                    color = Vector.getColor();
                    datasetTemplate.label = datasetName;
                    datasetTemplate.borderColor = color.backgroundColor;
                    datasetTemplate.data = dataTemplate.slice();
                    Object.assign(datasetTemplate,color);
                    reviewDatasets.push(Object.assign({}, datasetTemplate));
                });

                var i=0;
                response.reviewAveragesByMonth.forEach(function (source) {
                    reviewDatasets[0].data[i] = parseFloat(source.overall);
                    reviewDatasets[1].data[i] = parseFloat(source.accuracy);
                    reviewDatasets[2].data[i] = parseFloat(source.cleanliness);
                    reviewDatasets[3].data[i] = parseFloat(source.communication);
                    reviewDatasets[4].data[i] = parseFloat(source.checkIn);
                    reviewDatasets[5].data[i] = parseFloat(source.location);
                    reviewDatasets[6].data[i] = parseFloat(source.value);
                    i++;
                });

                var reviewAveragesChart = {
                    labels : labels,
                    datasets: reviewDatasets
                };

                $("#reviewAveragesByMonthContainer").html("<canvas id=\"reviewAveragesByMonthChart\" height=\"100\"></canvas>");
                $.ChartJs.respChart("reviewAveragesByMonthChart",'Line',reviewAveragesChart,{
                    chartTitle:'Past 12 Months Review Averages',
                    tooltips: {
                        mode: 'index',
                        intersect: false
                    },
                });
            }

        });
    },

    'showAdminReviews': function(onlyThisRow = null) {
        $(".rightContent").hide();

        var html = "<option class='dropdown-item' value='default'>Unit selection</option>";

        Object.values(Vector.listings).forEach(function(l) {
            if (l.active == 1 && l.isListed == 1 ) {
                html+="<option class='dropdown-item' value='" + l._id+ "'>" + l.nickname + "</option>";
            }
        });

        $("#adminReviewsListingSelect").html(html);
        $("#adminReservationReviewsListingSelect").html(html);
        
        api({method:'getReviewsData'}, function(response) {
            Vector.generateAdminReviewsTable(response.reviews);
            Vector.generateAdminReservationReviewsTable(response.reservationReviews);
        });

        if (onlyThisRow) {
            $("#adminReviews").children(':not("#AdminDashboardFilters")').hide();
            $(onlyThisRow).show();
        }

        $("#AdminDashboardFilters").prependTo("#adminReviews");
        $("#adminReviews").show();
    },

    'generateAdminReviewsTable': function (reviews) {
        var rowsHtml = '',
            getInputRestriction = function (fieldName) {
                var restrictions = {
                    totalReviews: 'required type="number" min="1"',
                    fiveStarsPercentage: 'required type="number" min="1" max="100"',
                    starsInput: 'required type="number" min="1" max="5" step="0.1"'
                };

                return restrictions.hasOwnProperty(fieldName) ? restrictions[fieldName] : restrictions.starsInput;
            };

        $('#adminReviewsListingSelect').val('default').selectpicker('refresh');

        reviews.forEach(function (review) {
            var fieldNames = Object.keys(review.editable);
            var values = Object.values(review.editable);
            rowsHtml += '<tr data-listing-id="' + review.fixed.listingId + '"><td>' + review.fixed.nickname + '</td>';
            rowsHtml += '<td class="lastUpdated">' + moment(review.fixed.createdAt).format('YYYY-MM-DD') + '</td>';
            rowsHtml += values.reduce(function(td, field, index) {
                td += '<td><input ' + getInputRestriction(fieldNames[index]) + ' class="form-control" name="' + fieldNames[index] + '" value="' + field + '"></td>';
                return td;
            }, '');

            rowsHtml += '<td><button class="btn btn-sm btn-default" onclick="Vector.saveReview($(this).closest(\'tr\'));">Save</button></td>';
            rowsHtml += '</tr>';
        });

        $('.editReviewsTable').find('tbody tr').remove();
        $('.editReviewsTable').find('tbody').append(rowsHtml);

        $('.editReviewsTable').DataTable({
            dom: 'Bfrtip',
            buttons: [
                {
                    extend:'copy',
                    exportOptions: {
                        orthogonal: 'export',
                        columns: 'th:not(:last-child)'
                    }
                },
                {
                    extend:'csv',
                    exportOptions: {
                        orthogonal: 'export',
                        columns: 'th:not(:last-child)'
                    }
                },
                {
                    extend:'excel',
                    exportOptions: {
                        orthogonal: 'export',
                        columns: 'th:not(:last-child)'
                    }
                },
                {
                    extend:'pdf',
                    exportOptions: {
                        orthogonal: 'export',
                        columns: 'th:not(:last-child)'
                    }
                },
                {
                    extend:'print',
                    exportOptions: {
                        orthogonal: 'export',
                        columns: 'th:not(:last-child)'
                    }
                }
            ],
            columnDefs:[
                {
                    targets:[2,3,4,5,6,7,8,9,10],
                    render: function (data, type) {
                        if (type === 'sort' || type === 'filter' || type == 'export') {
                            return $(data).val();
                        }
                        return data;
                    }
                },
                {
                    targets: 11,
                    searchable: false,
                    orderable: false
                }
            ]
        });
    },

    'generateAdminReservationReviewsTable': function (reviews) {
        var createTd = function (cellContent) {
            if (typeof cellContent === 'object') {
                return '<td>' +  getStarsAndFeedback(cellContent) + '</td>';
            }
            return '<td>' + cellContent + '</td>';
        };

        var getStarsAndFeedback = function (cellContent) {
            var starIcons = '', stars, arrowSeparator, feedback, i;
            for (i = 0; i < cellContent.stars; i++) {
                starIcons += '<i class="md md-star"></i>';
            }

            stars = '<span class="stars">' + starIcons + '</span>';
            arrowSeparator = '<span class="arrows"><i class="md md-arrow-drop-down visible"></i><i class="md md-arrow-drop-up"></i></span>';
            feedback = '<p class="feedback">' + cellContent.feedback + '</p>';

            return stars + arrowSeparator +  feedback;
        };

        var toggleFeedback = function ($arrowIcons) {
            $arrowIcons.find('i').toggleClass('visible');
            $arrowIcons.closest('td').find('.feedback').toggle();
        }
        if ($.fn.DataTable.isDataTable('.editReservationReviewsTable')) {
            $('.editReservationReviewsTable').DataTable().destroy();
        }
        $('#adminReservationReviewsListingSelect').val('default').selectpicker('refresh');

        var selectOption = "<option class='dropdown-item' value='default'>Reservation selection</option>";
        $('#adminReservationReviewsReservationSelect').html(selectOption).val('default').selectpicker('refresh');
        $('.reservationField').html('');

        var rowsHtml = '';
        reviews.forEach(function (review) {
            var currentRow = '<tr data-review-id="' + review._id + '"><td><span onclick="Vector.deleteReservationReview(' + review._id + ');"><i class="ion-close-circled btn"><i></span></td>'
            var values = Object.values(review);
            values.splice(0,1); //remove _id from review's values
            rowsHtml += values.reduce(function (tr, field) {
                tr += createTd(field);
                return tr;
            }, currentRow);
            rowsHtml += '</tr>';
        });

        $('.editReservationReviewsTable').find('tbody tr').remove();
        $('.editReservationReviewsTable').find('tbody').append(rowsHtml);
        $('.editReservationReviewsTable').DataTable({
            drawCallback: function () {
                $('span.arrows').click(function (event) {
                    var span = $(event.currentTarget);
                    toggleFeedback(span);
                });
            },
            dom: 'Bfrtip',
            buttons: [ 
                {
                    extend:'copy',
                    exportOptions: {
                        orthogonal: 'export'
                    }
                },
                {
                    extend:'csv',
                    exportOptions: {
                        orthogonal: 'export'
                    }
                },
                {
                    extend:'excel',
                    exportOptions: {
                        orthogonal: 'export'
                    }
                },
                {
                    extend:'pdf',
                    exportOptions: {
                        orthogonal: 'export'
                    }
                },
                {
                    extend:'print',
                    exportOptions: {
                        orthogonal: 'export'
                    }
                }
            ],
            columnDefs:[
                {
                    targets: 0,
                    searchable: false,
                    orderable: false
                },
                {
                    tergets: [1,2,3,4,5,6,7],
                    render: function (data) {
                        return data;
                    }
                },
                {
                    targets:[8,9,10,12,13],
                    render: function (data, type) {
                        if (type === 'sort') {
                            return data.match(/md-star/g).length;
                        } else if (type === 'export' || type === 'filter') {
                            try {
                                var stars = 'stars: ' + data.match(/md-star/g).length;
                                var feedback = ' - feedback: ' + data.match(/<p\sclass=\"feedback\">((.|\s)*)<\/p>$/)[1];
                                return stars + feedback;
                            } catch(error) {
                                console.log(error);
                                console.log(data);
                                return 'feedback not available';
                            }
                        };
                        return data;
                    }
                }
            ]
        });
    },

    'getNewReviewInputs': function (tr) {
        var inputs = tr.find('.form-control:not("div"):not("input[type=text]")');

        return Object.values(inputs).reduce(function (dataObject, element) {
            dataObject[element.name] = element.value;
            return dataObject;
        }, {});
    },

    'saveReservationReview': function (event) {
        event.preventDefault();
        var form = $(event.target);
        var inputsData = Vector.getNewReviewInputs(form);
        var errorMessage = 'All inputs are required. Check the range of values that correspond to each one.';

        var errors = Object.values(inputsData).some(function (value) {
            return value == "";
        });
      
        if (errors) {
            Vector.showErrorAlert('.adminReservationReviewsAlert', errorMessage);
            return;
        }

        api(Object.assign({method:'saveReservationReview'}, inputsData), function (response) {
            if ('errors' in response) {
                Vector.showErrorAlert('.adminReservationReviewsAlert', errorMessage);
                return;
            } else {
                form.find('.form-control').val('');
                $('#newReservationReviewModal').modal('hide');
                Vector.showAdminReviews();
            }
        });
    },

    'deleteReservationReview': function (reviewId) {
        var tr = $('tr[data-review-id="' + reviewId +'"]');
        if (confirm('Are you sure you want to delete the review?')) {
            api({reviewId: reviewId}, function (response) {
                tr.remove();
            });
        };
    },

    'saveReview': function(tr) {
        var inputsData = Vector.getNewReviewInputs(tr);
        var newRow = typeof tr.data('listing-id') === 'undefined';
        var errorMessage = 'All inputs are required. Check the range of values that correspond to each one.';
 
        var errors = Object.values(inputsData).some(function (value) {
            return value == "" || parseInt(value) < 0;
        });

        if (errors) {
            Vector.showErrorAlert('.adminReviewsAlert', errorMessage);
            return;
        }

        if (!newRow) {
            inputsData['listingId'] = tr.data('listing-id');
        }

        api(Object.assign({method:'saveReview'}, inputsData), function (response) {
            if ('errors' in response) {
                Vector.showErrorAlert('.adminReviewsAlert', errorMessage);
                return;
            }

            if (newRow) {
                tr.find('.form-control').val('');
                Vector.showAdminReviews();
            }

            tr.find('.lastUpdated').html(moment().format('YYYY-MM-DD H:mm'));
        });
    },

    'showErrorAlert' : function (alertSelector, message) {
        $(alertSelector).html(message).show().fadeOut(6000);
    },

    'fillVacancyOptimizer': function() {
        if (window.lastSelectedVacancyOptimizerId != Vector.selectedListingId ) {
            Vector.needToRefreshCompAnalytics = true;
            for(var i in Vector.bnbtrackerProperties) {
                if(Vector.bnbtrackerProperties[i].id == Vector.listings[Vector.selectedListingId].airbnb_id) {
                    foundListing = Vector.bnbtrackerProperties[i];
                    break;
                }
            }
            if (selectedProperty != foundListing) {
                selectedProperty = foundListing;
                Vector.getCompList(selectedProperty, Vector.fillVacancyOptimizer);
                return;
            }
            window.lastSelectedVacancyOptimizerId = Vector.selectedListingId;
        }
        if(!Vector.needToRefreshCompAnalytics) {
            $("#vacancyOptimizer").show();
            return;
        }
        if(!selectedProperty || selectedComps.length==0) {
            $("#vacancyOptimizerContent").html("Please select a property with defined comps."); return;
        }


        var propertyIds = [selectedProperty.id];
        for(var i in selectedComps) {
            propertyIds.push(selectedComps[i].id);
        }


        $("#vacancyOptimizerDateRange").daterangepicker({
            "startDate": Vector.startDateFilter,
            "endDate": Vector.endDateFilter,
            "ranges": ranges
        }, function(start, end, label) {
            showLoading("#monthlyTable");
            getPricesForProperties(propertyIds,start.clone(),end.clone());
        });
        showLoading("#monthlyTable");
        getPricesForProperties(propertyIds, Vector.startDateFilter.clone(), Vector.endDateFilter.clone());

    },

'showAdminOccupancy':function(options) {
        api({method:'getOccupancyMetrics'},function(data) {
            Vector.adminOccupancyMetrics = data.occupancyByDate;
            Vector.adminDashboard.occupancyLookahead = data.occupancyLookahead;
            Vector.generateOccupancyLookaheadTable(Vector.adminDashboard.occupancyLookahead);
            Vector.generateOccupancyVsCompAvgTable();

            $(".rightContent").hide();

            if(!options) options ={};
            if(!('by' in options)) options.by = 'day';

            var occData=Vector.adminOccupancyMetrics;
            var todaystring = moment().format("YYYY-MM-DD");
            if(!(todaystring in occData)) occData[todaystring] = { lostRev:0, numVacancies:0};
            $("#adminOccupancyLostRevenue").html(occData[todaystring].lostRev.moneyString());
            $("#adminOccupancyVacanciesTonight").html(occData[todaystring].numVacancies);
            var occChart = {
                labels: [],
                datasets: [
                    {
                        label: "Lost Revenue",
                        yAxisID: 'A',
                        fill: false,
                        type: "line",
                        data: [],
                        borderColor: '#000',
                        borderWidth: 1
                    },
                    {
                        label: "Vacancies",
                        data: [],
                        yAxisID: 'B',
                        dataType:'valuewithpercent',
                        totals:[]
                    },
                    {
                        label: "Same Day Bookings",
                        data: [],
                        yAxisID: 'B',
                        dataType:'valuewithpercent',
                        totals:[]
                    },
                    {
                        label: "One Day Bookings",
                        data: [],
                        yAxisID: 'B',
                        dataType:'valuewithpercent',
                        totals:[]
                    },
                    {
                        label: "Two Day Bookings",
                        data: [],
                        yAxisID: 'B',
                        dataType:'valuewithpercent',
                        totals:[]
                    },
                    {
                        label: "Advanced Bookings",
                        data: [],
                        yAxisID: 'B',
                        dataType:'valuewithpercent',
                        backgroundColor:'rgba(250,250,250,0.8)',
                        hoverBackgroundColor:'rgba(250,250,250,1.0',
                        totals:[]
                    },
                ],
            };
            Vector.resetColorIndex();
            Object.assign(occChart.datasets[0],{
                backgroundColor: 'rgb(153, 102, 255)',
                hoverBorderColor: "#000"
            });

            Object.assign(occChart.datasets[1],{
                backgroundColor: 'rgb(104, 212, 255)',
                hoverBorderColor: "#000"
            });

            Object.assign(occChart.datasets[2],{
                backgroundColor: 'rgb(255, 99, 132)',
                hoverBorderColor: "#000"
            });

            Object.assign(occChart.datasets[3],{
                backgroundColor: 'rgb(255,255,0)',
                hoverBorderColor: "#000"
            });

            var curdatepart=undefined;
            var datepart = undefined;
            var datacount=0;
            var totalrevlost=0;
            for(var m=moment(Vector.startDateFilter); m.isSameOrBefore(Vector.endDateFilter); m.add(1,'days')) {
                dateLabel=m.format("YYYY-MM-DD");
                switch (options.by) {
                    case 'day':
                        curdatepart = dateLabel;
                        break;
                    case 'month':
                        //sum the month values until we encounter a new month value
                        curdatepart = m.format("MMM");
                        break;
                    case 'year':
                        curdatepart = m.format("YYYY");
                        break;
                }
                if (datepart != curdatepart) {
                    datepart = curdatepart;
                    occChart.labels.push(curdatepart);
                    occChart.datasets[0].data.push(0);
                    occChart.datasets[1].data.push(0);
                    occChart.datasets[1].totals.push(0);
                    occChart.datasets[2].data.push(0);
                    occChart.datasets[3].data.push(0);
                    occChart.datasets[4].data.push(0);
                    occChart.datasets[5].data.push(0);
                    datacount++;
                }
                var revlost =  (dateLabel in occData)?(parseFloat(occData[dateLabel].lostRev)||0):0;
                occChart.datasets[1].data[datacount-1] += (dateLabel in occData)?(parseFloat(occData[dateLabel].numVacancies)||0):0;
                occChart.datasets[2].data[datacount-1] += (dateLabel in occData)?(parseFloat(occData[dateLabel].numSameDay)||0):0;
                occChart.datasets[3].data[datacount-1] += (dateLabel in occData)?(parseFloat(occData[dateLabel].numOneDay)||0):0;
                occChart.datasets[4].data[datacount-1] += (dateLabel in occData)?(parseFloat(occData[dateLabel].numTwoDay)||0):0;
                occChart.datasets[5].data[datacount-1] += (dateLabel in occData)?(parseFloat(occData[dateLabel].numAdvancedBookings)||0):0;

                occChart.datasets[1].totals[datacount-1] += occChart.datasets[1].data[datacount-1]+
                                                            occChart.datasets[2].data[datacount-1]+
                                                            occChart.datasets[3].data[datacount-1]+
                                                            occChart.datasets[4].data[datacount-1]+
                                                            occChart.datasets[5].data[datacount-1];
                occChart.datasets[2].totals[datacount-1] = occChart.datasets[1].totals[datacount-1];
                occChart.datasets[3].totals[datacount-1] = occChart.datasets[1].totals[datacount-1];
                occChart.datasets[4].totals[datacount-1] = occChart.datasets[1].totals[datacount-1];
                occChart.datasets[5].totals[datacount-1] = occChart.datasets[1].totals[datacount-1];

                occChart.datasets[0].data[datacount-1] +=  revlost;
                totalrevlost+= revlost;
            }

            var getVacanciesOn = function (date) {
              api({date:date},function(data) {
                     var subsetOccupancyLookahead=[];
                  Vector.adminDashboard.occupancyLookahead.forEach(function (e) {
                    if(data.vacantUnitIds.indexOf(e._id)>=0) {
                        subsetOccupancyLookahead.push(e);
                    }
                  });

                  $("#vacantOccupancyLookaheadTable").html("<h4 class='m-t-0 header-title'>Vacant Listings on "+date+"</h4><table class='p-1 table w-100'></table>");
                  $("#vacantOccupancyLookaheadTable").find("table").on("draw.dt", function (){
                    setTimeout(function () {
                        $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
                    }, 200);
                    }).DataTable({
                        sScrollX: "100%",
                        sScrollXInner: "110%",
                        bScrollCollapse: true,
                        data:subsetOccupancyLookahead,
                        columns: [
                            {data: "nickname",title:"name", "fnCreatedCell": Vector.guestyListingDatatableLink},
                            {data: "address_city",title:"city"},
                            {data: "7day",title:"7day",  "render":renderPercentColumn },
                            {data: "30day",title:"30day", "render":renderPercentColumn},
                            {data: "60day",title:"60day", "render":renderPercentColumnNoWarnings},
                            {data: 'cleaningFee', title:'cleaning', render: moneyFormatter},
                            {data: 'tonightsPrice', title:'price tonight', render:moneyFormatter},
                            {data: 'vacantPrice', title:'vacant price', render:moneyFormatter}
                        ]
                    });
              });
            };

            var occchartcanvas;
            var clickfn = function(e) {
                var e = occchartcanvas.getElementAtEvent(e);
                if(e && e.length>0)

                getVacanciesOn(e[0]._xScale.ticks[e[0]._index]);

            };

            $("#adminOccupancyCardBox").html("<canvas id=\"adminOccupancyChart\" height=\"100\"></canvas>");
            occchartcanvas=$.ChartJs.respChart("adminOccupancyChart",'Bar',occChart,{
                chartTitle:'Revenue lost to Vacancy<br>'+totalrevlost.moneyString(),
                redraw: 'showAdminOccupancy',
                dateparts:options.by,
                onClick: clickfn,
                tooltips: {
                    mode: 'index',
                    intersect: false
                },
                scales: {
                    yAxes: [{
                        id: 'A',
                        type: 'linear',
                        position: 'right',
                        ticks: {
                            min:0
                        }
                    },
                        {
                            id: 'B',
                            type: 'linear',
                            position: 'left',
                            stacked: true,
                            ticks: {
                                min: 0
                            }
                        }],
                    xAxes: [{
                        stacked:true,
                        categoryPercentage: 1.0,
                        barPercentage: 1.0
                    }]
                }
            });
            Vector.generateOccupancyLookaheadChart(Vector.adminDashboard.occupancyLookahead);

            Vector.moveFiltersTo("#adminOccupancy");
            $("#adminOccupancy").show();
        });
    },
    'generateOccupancyLookaheadChart':function(a, date) {
        var horizontalOccupancyChart = {
            labels: [],
            datasets:[
                {
                    label: "30 day",
                    dataType: "percentHorizontal",
                    data:[],
                },{
                    label: "60 day",
                    dataType: "percentHorizontal",
                    data:[],
                    hidden: true,
                },{
                    label: "90 day",
                    dataType: "percentHorizontal",
                    data:[],
                    hidden: true,
                    }
            ]
        };

        var occLookaheadDataByCity = {};
        var cityCounts={};
        var label;
        a.forEach(function (e) {
            if (e.isListed == 0 || e.active == 0) {
                return;
            }

            if(Vector.selectedFilters && (Vector.selectedFilters['city'] || Vector.selectedFilters['tag'])) {
                if((Vector.selectedFilters['city'] && Vector.selectedFilters['city'].indexOf(e.address_city)>=0) ||
                    (Vector.selectedFilters['tag'] && e.tags && e.tags.split(",").some(v=>Vector.selectedFilters['tag'].indexOf(v)>=0)))
                    label = e.nickname;
                else return;
            } else {
                label = e.address_city;
            }

            if(!(label in occLookaheadDataByCity)) {
                cityCounts[label] = 1;
                var o = {
                    day30: parseFloat(e['30day']) || 0,
                    day60: parseFloat(e['60day']) || 0,
                    day90: parseFloat(e['90day']) || 0
                };
                occLookaheadDataByCity[label]=o;
            } else {
                cityCounts[label]++;
                occLookaheadDataByCity[label].day30+=parseFloat(e['30day'])||0;
                occLookaheadDataByCity[label].day60+=parseFloat(e['60day'])||0;
                occLookaheadDataByCity[label].day90+=parseFloat(e['90day'])||0;
            }
        });

        Vector.resetColorIndex();
        Object.assign(horizontalOccupancyChart.datasets[0],Vector.getColor());
        Object.assign(horizontalOccupancyChart.datasets[1],Vector.getColor());
        Object.assign(horizontalOccupancyChart.datasets[2],Vector.getColor());
        for(var city in cityCounts) {
            occLookaheadDataByCity[city].day30*=100;
            occLookaheadDataByCity[city].day30/=cityCounts[city];
            occLookaheadDataByCity[city].day60*=100;
            occLookaheadDataByCity[city].day60/=cityCounts[city];
            occLookaheadDataByCity[city].day90*=100;
            occLookaheadDataByCity[city].day90/=cityCounts[city];
            var checkInRange = [
                'day30',
                'day60',
                'day90'
            ];
            var activeMarket = checkInRange.some(function (range) {
                return occLookaheadDataByCity[city][range].toFixed(0) > 0 ;
            });
            if (!activeMarket) {
                continue;
            }
            horizontalOccupancyChart.labels.push(city);
            horizontalOccupancyChart.datasets[0].data.push(occLookaheadDataByCity[city].day30);
            horizontalOccupancyChart.datasets[1].data.push(occLookaheadDataByCity[city].day60);
            horizontalOccupancyChart.datasets[2].data.push(occLookaheadDataByCity[city].day90);
        }

        $("#adminHorizontalOccupancyLookaheadCardBox").html("<canvas id=\"adminHorizontalOccupancyLookaheadChart\"></canvas>");
        $.ChartJs.respChart("adminHorizontalOccupancyLookaheadChart",'horizontalBar',horizontalOccupancyChart,{
            chartTitle:'Occupancy Lookahead 30/60/90',
            tooltips: {
                mode: 'index',
                intersect: false
            },
            scales: {
                yAxes: [{
                    categoryPercentage:1,
                    barPercentage: 1,
                }],
                xAxes: [{
                    type: 'linear',
                    position: 'left',
                    ticks: {
                        min: 0,
                        max: 100
                    }
                }]
            }
        });

    },
    'generateAdminRevenueByChannel': function() {
        var channelRev = [];
        var totals = [];
        var months = {};
        var grandtotals={ 'Total':0};
        Vector.adminDashboard.revenueByChannel.forEach(function (r) {
            if (!(r.revsource in channelRev)) channelRev[r.revsource] = [];
            var m =r.month;
            var mformatted = moment(m).format("YY-MMM");
            var rev=parseFloat(r.rev);
            months[m]=m;
            channelRev[r.revsource][mformatted] = rev;
            if(!(r.revsource in grandtotals)) grandtotals[r.revsource]=0;
            if(r.revsource!='vacant') {
                totals[mformatted] = rev + (totals[mformatted] ? totals[mformatted] : 0);
                grandtotals['Total']+=rev;
            }
            grandtotals[r.revsource]+=rev;
        });
        months = Object.keys(months).sort();
        months.forEach(function (m, i, a) {
            a[i] = moment(m).format("YY-MMM");
        });

        channelRev['Total']=totals;

        var sourcerows = [];
        var datasets = [];
        var i=0;

        for (var source in channelRev) {
            if (source != 'vacant') {
                sourcerows[source] = "<tr><th class='text-right'>";

                sourcerows[source]+= "<span class='text-success float-left'>"+(100*grandtotals[source]/grandtotals['Total']).toFixed(0)+"%</span>"+
                    source + "<br/><span class='text-success'>"+grandtotals[source].moneyString()+"</span></th>";
                var d = {
                    label: source,
                    data: []
                };

                Object.assign(d,app_configs.colors[i]);

                for (var m in months) {
                    m=months[m];
                    if (m in channelRev[source]) {
                        d.data.push(channelRev[source][m]);
                        sourcerows[source] += "<td class='p-2 text-center'>" + parseFloat(channelRev[source][m]).toFixed(2).moneyString();
                        if(source!='Total') {
                            sourcerows[source]+="<span class='text-success float-right'>"+(100*channelRev[source][m]/channelRev['Total'][m]).toFixed(0) +"%</span>";
                        }
                        sourcerows[source]+="</td>";
                    } else {
                        d.data.push(0);
                        sourcerows[source] += "<td class='p-2 text-center'>0 <span class='text-success float-right'>0%</span></td>";
                    }
                }
                if(source!='Total') datasets.push(d);
                sourcerows[source] += "</tr>";
                i++;
            }
        }

        var html = "<thead><th style='width:150px'></th>";
        for (var m in months) html += "<th class='text-center' style='min-width: 150px;'>" + months[m] + "</th>";
        html += "</tr></thead><tbody>";
        for (var source in sourcerows) html += sourcerows[source];
        html+="</tbody>";

        $("#adminMonthlyRevenueByChannelChart").parent().html(
            '<canvas id="adminMonthlyRevenueByChannelChart" height="100"></canvas>');
        var chartdata = {
            labels: months,
            datasets: datasets
        };
        $.ChartJs.respChart("adminMonthlyRevenueByChannelChart",'Bar',chartdata,
            {
                chartTitle: 'Monthly Revenue By Channel<br/>'+grandtotals['Total'].moneyString(),
                title: {
                    display: false,
                    text: ''
                },
                tooltips: {
                    mode: 'index',
                        intersect: false
                },
                responsive: true,
                scales: {
                    xAxes: [{
                        stacked: true,
                    }],
                        yAxes: [{
                        stacked: true
                    }]
                },
                datatableHTML: html //not functional in respChart yet, but charts sent this will include a flip button to see raw data
            }
        );

        $("#adminMonthlyRevenueByChannelChart").parent().parent().append(
        '<span title="Click to regenerate cache" style="color:#98a6ad; cursor:pointer; font-size: 12px;position: absolute;top: 5px;right: 40px;" onClick="refreshCache();">Cached on '+
        moment(Vector.adminDashboard.cacheUpdatedOn).format('MMMM Do YYYY, h:mm:ss a')+'</span>');

        var downloadCSV = $(".monthlyRevByChannel");
        downloadCSV.click(function () {

            var headers = {source: 'Channel'};

            months.forEach(function (month) {
                headers[month] = month;
            });

            items = [];

           for (var source in channelRev) {
                var row = {
                    source: source,
                };

                for(var month in channelRev[source]) {
                    row[month] = parseFloat(channelRev[source][month]).toFixed(2);
                }

                items.push(row);
            }

            var fileTitle = 'monthly revenue by channel';

            exportCSVFile(headers, items, fileTitle);

            });
    },

    'parsePastYearMonthlyRevenue': function (data) {
        try {
            var monthsTemplate = [];
        var dataTemplate = [];
        var labels = [];
        var auxMonth = moment().subtract(12, 'M');
        var i = 0;
        for (i; i < 12; i++, auxMonth.add(1, 'M')) {
            dataTemplate.push(0); // template for the source's revenue
            monthsTemplate.push(auxMonth.format('Y-MM'));
            labels.push(auxMonth.format('Y-MMM'));
        }

        var datasets = [];
        if (data && (data.length > 0)) {
            var source = {
                label: data[0].revsource,
                data: dataTemplate.slice()
            };

            Vector.resetColorIndex();
            Object.assign(source, Vector.getColor());

            data.forEach(function (monthRev) {
                if (monthRev.revsource != source.label) {
                    datasets.push(Object.assign({}, source));
                    source.label = monthRev.revsource;
                    source.data = dataTemplate.slice();
                    Object.assign(source, Vector.getColor());
                }
                i = monthsTemplate.indexOf(monthRev.month);
                source.data[i] = parseFloat(monthRev.revenue).toFixed(2);
            });

            datasets.push(source);
        }

        return {
            labels: labels,
            datasets: datasets
        };
        } catch (error) {
            console.log(error);
            return {
                labels: [],
                datasets: []
            }
        }
    },
    'generateAdminLastYearRevenue': function () {
        $("#adminLastYearRevenueTable").html("<h4 class='ml-3 mt-2 mb-2 header-title'>Last 12 Month Revenue</h3><table class='p-1 table w-100'><thead></thead><tbody></tbody><tfoot></tfoot></table>");
        $("#adminLastYearRevenueTable").prepend("<a style='float:right;font-size: 20px;' class='toggleData_adminLastYearRevenueChart'><i class='md md-grid-on'></i></a>")
        $("#adminLastYearRevenueTable").find("table").DataTable({
            data: Vector.adminDashboard.lastYearRev,
            columns: [
                {data: "month", title: "Month"},
                {data: "revsource", title: "Source"},
                {data: "revenue", title: "Revenue", "render": moneyFormatter},
            ]
        });

        $("#adminLastYearRevenueChartContainer").html("<canvas id=\"adminLastYearRevenueChart\"></canvas>");
        $.ChartJs.respChart(
            "adminLastYearRevenueChart",
            'Bar',
            Vector.parsePastYearMonthlyRevenue(Vector.adminDashboard.lastYearRev),
            {
                chartTitle: 'Last 12 Month Revenue<br/>',
                responsive: true,
                swapTable: true,
                scales: {
                    xAxes: [{
                        stacked: true
                    }],
                    yAxes: [{
                        ticks: {
                            beginAtZero: true,
                        },
                        stacked: true
                    }]
                }
            }
        );
    },

    'showAdminUsers': function() {
        $(".rightContent").hide();
        $("#adminUsers").show();
    },

    'showUserDashboard': function() {
        if(!('dashboardData' in Vector)) {
            Vector.loadUser();
            return;
        }

        if ($('#User_unitFilterSelectDiv').html().trim() == '') {
            $('#Admin_unitFilterSelectDiv').children().appendTo('#User_unitFilterSelectDiv');
            $('#User_unitFilterSelectDiv').on('hide.bs.dropdown', function () {
                Vector.loadUser();
            })
        }

        Vector.adminDashboard.revenueByCity = Vector.dashboardData.revenueByCity;
        $("#occRevTable").prependTo("#occRevTableUser");
        Vector.setupOccupancyAndRevenueTable();


        $(".rightContent").hide();
        $('#userDashboard').show().addClass('bounceInDown animated').one('webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend', function(){
            $(this).removeClass("bounceInDown animated");
        });
        $('#unitPerformanceCalendar').fullCalendar('today');
        $(".unitPerformanceStats").insertAfter($(".fc-toolbar"));

    },
    'showUserListings': function() {
        $(".rightContent").hide();
        $("#userListings").show();
        if(!('dashboardData' in Vector)) {
            Vector.loadUser(Vector.showUserListings);
            return;
        }
    },
    'showUserListingPerformance': function(listingId) {
        if(listingId) Vector.selectedListingId=listingId;
        if(!('dashboardData' in Vector)) {
            Vector.loadUser(Vector.showUserListingPerformance);
            return;
        }
        $(".rightContent").hide();
        $("#userListingPerformanceContainer").prependTo("#userListingsPerformance");
        $("#userListingsPerformance").show();

        $('#unitPerformanceCalendar').fullCalendar('render');
        $('#unitPerformanceCalendar').fullCalendar('refetchEvents');
    },
    'generateUserLastYearRevenue': function() {
        $("#dashboardLastYearRevenueTable").html("<h4 class='ml-3 mt-2 mb-2 header-title'>Past year monthly revenue</h3><table class='p-1 table w-100'><thead></thead><tbody></tbody><tfoot></tfoot></table>");
        $("#dashboardLastYearRevenueTable").prepend("<a style='float:right;font-size: 20px;' class='toggleData_dashboardLastYearRevenueChart'><i class='md md-grid-on'></i></a>")
        $("#dashboardLastYearRevenueTable").find("table").DataTable({
            data: Vector.dashboardData.lastYearRev,
            columns: [
                {data: "month", title: "Month"},
                {data: "revsource", title: "Source"},
                {data: "rev", title: "Revenue", "render": moneyFormatter},
            ]
        });

        $("#dashboardLastYearRevenueChartContainer").html("<canvas id=\"dashboardLastYearRevenueChart\"></canvas>");
        $.ChartJs.respChart(
            'dashboardLastYearRevenueChart',
            'Bar',
            Vector.parsePastYearMonthlyRevenue(Vector.dashboardData.lastYearRev),
            {
                chartTitle: 'Past Year Monthly Revenue<br/>',
                responsive: true,
                swapTable: true,
                scales: {
                    xAxes: [{
                        stacked: true
                    }],
                    yAxes: [{
                        ticks: {
                            beginAtZero: true,
                        },
                        stacked: true
                    }]
                }
            }
        );
    },

    'generateMonthlyDashboard':function() {
        var revChart = {
            labels: [],
            datasets: [
                {
                    label: "Revenue",
                    data: []
                }
            ]
        };
        Vector.resetColorIndex();
        Object.assign(revChart.datasets[0],Vector.getColor());

        var found=0;
        for(var i in Vector.dashboardData.monthlystats) {
            var s = Vector.dashboardData.monthlystats[i];
            revChart.labels.push(moment(s.month).format('YYYY-MMM'));
            if(Vector.startDateFilter.format('YYYY-MMM')==moment(s.month).format('YYYY-MMM')) {
                $('#userDashboard_rev').html(parseFloat(s.rev).moneyString());
                $('#userDashboard_adr').html(parseFloat(s.adr).moneyString());
                $('#userDashboard_reservations').html(s.reservations);
                $('#userDashboard_occ').html(parseFloat(s.occ).toFixed(2)+'%');
                $('#userDashboard_ownerPayout').html((parseFloat(s.rev)*(1-user.commission)).moneyString());
                found=1;
            }
        }

        if(!found) {
            $('#userDashboard_rev').html('$0.00');
            $('#userDashboard_adr').html('$0.00');
            $('#userDashboard_occ').html('0%');
            $('#userDashboard_staylength').html('');
            $('#userDashboard_ownerPayout').html('');
        }

        var adrChart=JSON.parse(JSON.stringify((revChart)));
        var occChart=JSON.parse(JSON.stringify((revChart)));
        occChart.datasets[0].dataType='percent';
        var staylengthChart=JSON.parse(JSON.stringify((revChart)));
        staylengthChart.datasets[0].dataType='float';

        adrChart.datasets[0].label="Average Daily Rate";
        occChart.datasets[0].label="Occupancy";
        staylengthChart.datasets[0].label="Average Stay Length";

        for(var i in Vector.dashboardData.monthlystats) {
            var s = Vector.dashboardData.monthlystats[i];
            revChart.datasets[0].data.push(parseFloat(s.rev).toFixed(2));
            adrChart.datasets[0].data.push(parseFloat(s.adr).toFixed(2));
            occChart.datasets[0].data.push(parseFloat(s.occ).toFixed(2));
            staylengthChart.datasets[0].data.push(parseFloat(s.staylength));
        }

        $.ChartJs.respChart("dashboardRevChart",'Bar',revChart);
        $.ChartJs.respChart("dashboardAdrChart",'Bar',adrChart);
        $.ChartJs.respChart("dashboardOccChart",'Bar',occChart);
        $.ChartJs.respChart("dashboardStayLengthChart",'Bar',staylengthChart);
    },

    'selectListing': function(lid) {
        $(".listing").removeClass("selected");
        $(".listing_"+lid).addClass("selected");
        Vector.selectedListingId=lid;
    },

    'deleteUser':function() {
        if(confirm("Are you sure you want to delete this user?"))
            api({user_id:Vector.selectedUserId},function(response) {
                delete(Vector.users[Vector.selectedUserId]);
                delete(Vector.selectedUserId);
                Vector.selectUser(user.user_id);
                Vector.generateUsersTable();
            });
    },

    'saveUserData': function(userId) {
        var data = {
            method: 'saveUser'
        };

        var selector = '#newuser';

        if (userId) {
            data['user_id'] = userId;
            selector = '#edituser';
        } else {
            data['username'] = $(selector + "_username").val();
        }
        data['password'] = $(selector + "_password").val();
        data['username'] = $(selector + "_username").val();
        data['commission'] = $(selector + "_commission").val();
        data['fullname'] = $(selector + "_fullname").val();
        data['email'] = $(selector + "_email").val();
        data['role'] =  $(selector + "_role").val();

        api(data ,function(response){
            Vector.users=response.users;
            $(".newuser_variable").val("");
            Vector.generateUsersTable();
        })
    },

    'generateUserListingTable': function() {
        //var html = "<thead><tr><th>id</th><th>name</th><th>title</th><th>address</th><th>price</th><th>cleaning</th></tr>";
        //html += "<tbody>";
        var a = [];
        for (var i in Vector.dashboardData.listings) {
            a.push(Vector.dashboardData.listings[i]);
        }
   //         html += "<tr class='listing listing_"+l._id+"' onClick='Vector.selectListing(\""+l._id+"\");'><td>" + l._id + "</td><td>" + l.nickname + "</td><td>"+l.title+"</td><Td>"+l.address_full+"</Td>"+
     //               "<td>" + l.basePrice + "</td><td>" + l.cleaningFee + "</td></tr>";
       // }
       // html += "</tbody>";
        if (!$.fn.DataTable.isDataTable("#userListingsTable")) {
            $('#userListingsTable').DataTable({
                data: a,
                columns: [
                    {data: "_id", title: "Name", "fnCreatedCell": Vector.guestyListingDatatableLink},
                    {data: "title", title: "Title"},
                    {data: "address_full", title: "Address"},
                    {data: "basePrice", title: "Price", "render": moneyFormatter},
                    {data: "cleaningFee", title: "Cleaning", "render": moneyFormatter},
                ]
            });
        } else {
            $('#userListingsTable').dataTable().fnClearTable();
            $('#userListingsTable').dataTable().fnAddData(a);
        }
    },

    'getReservationData': function() {
        if(Vector.selectedListingId=='') Vector.selectedListingId=Object.keys(Vector.dashboardData.listings)[0];
        let start = Vector.startDateFilter;
        let end = Vector.endDateFilter;
        api({
            'filters': JSON.stringify({'unit':[Vector.selectedListingId]}),
            'start': start?start.format("YYYY-MM-DD"):Vector.startDateFilter.format("YYYY-MM-DD"),
            'end': end?end.format("YYYY-MM-DD"):Vector.endDateFilter.format("YYYY-MM-DD")
        },function(data) {
            Vector.listingReservations=data.reservations;
            $('#unitPerformanceCalendar').fullCalendar('render');
            $('#unitPerformanceCalendar').fullCalendar('refetchEvents');
            Vector.generateUserReservationTable();
        });
    },

    'generateUserReservationTable': function() {
        var matchingReservations = [];
        var totalRev = 0;
        var totalRevInRange = 0;
        var totalRevNights = 0;

        for(var i in Vector.listingReservations) {
            var r = Vector.listingReservations[i];
            if(r.listingId!=Vector.selectedListingId) continue;
            var checkin = moment(r.checkIn);
            var checkout = moment(r.checkOut);
            if(checkin.isBetween(Vector.startDateFilter,Vector.endDateFilter,null,'[]') || checkout.isBetween(Vector.startDateFilter,Vector.endDateFilter,null,'(]')
                || (checkin.isBefore(Vector.startDateFilter) && checkout.isAfter(Vector.endDateFilter))) {
                r.numNights = checkout.diff(checkin,'days');
                if(r.status=='confirmed')
                totalRevNights += Vector.daysInRange(checkin,checkout,Vector.startDateFilter,Vector.endDateFilter);

                var rev = parseFloat(r.hostPayout) - parseFloat(r.fareCleaning);
                totalRev += rev;
                r.revInRange = Vector.revInRange(rev,checkin,checkout,Vector.startDateFilter,Vector.endDateFilter);
                totalRevInRange += r.revInRange;
                matchingReservations.push(r);
            }
        }

        $("#rangeNetRevenue").html(totalRevInRange.moneyString());
        $("#rangeADR").html((totalRevInRange/totalRevNights).moneyString());
        $("#rangeOccupancy").html((100*totalRevNights/(Vector.endDateFilter.diff(Vector.startDateFilter,'days') + 1)).toFixed(0)+"%");
        $("#rangeOwnerPayout").html(((1-user.commission)*totalRevInRange).moneyString());

      //  console.log("total rev:"+totalRev);
      //  console.log("total revInRange:"+totalRevInRange);


      //  console.log("matchingres",matchingReservations);

        try {
            if (!$.fn.DataTable.isDataTable("#userReservationsTable")) {
                $("#userReservationsTable").on("draw.dt", function (){
                    setTimeout(function () {
                        $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
                    }, 200);
                    }).DataTable({
                    sScrollX: "100%",
                    sScrollXInner: "110%",
                    bScrollCollapse: true,
                    errMode:'none',
                    dom: 'Bfrtip',
                    buttons: [ 'copy', 'csv', 'excel', 'pdf', 'print' ],
                    data: matchingReservations,
                    columns: [
                        {data: "fullName", title: "Guest", "fnCreatedCell": Vector.guestyGuestDatatableLink},
                        {data: "confirmedAt", title: "Confirmed", "render": dateFormatter},
                        {data: "guestsCount", title: "Guests"},
                        {data: "hostPayout", title: "Payout", "render": moneyFormatter},
                        {data: "fareCleaning", title: "Cleaning Fee", "render": moneyFormatter},
                        {data: "revInRange", title: "Rev in Range", "render": moneyFormatter},
                        {data: "checkIn", title: "Check In"},
                        {data: "checkOut", title: "Check Out"},
                        {data: "status", title: "status"},
                        {data: "numNights", title:"Nights"}
                    ]
                });
            } else {
                $('#userReservationsTable').dataTable().fnClearTable();
                $('#userReservationsTable').dataTable().fnAddData(matchingReservations);
            }
        } catch(e) { console.log(e);}
    },

    'clickUnitPerformanceCalendarEvent':  function(calEvent, jsEvent, view) {
        console.log('modal with info coming soon: ',calEvent);
    },

    'selectUser': function(userid) {
        Vector.selectedUserId=userid;
        user.commission=Vector.users[Vector.selectedUserId].commission;
        if(Vector.users[Vector.selectedUserId].listings)
            Vector.selectedListingId = Vector.users[Vector.selectedUserId].listings[0];
        delete(Vector.dashboardData);
        $(".user").removeClass('selected');
        $(".user_"+userid).addClass('selected');
        $(".active-username").html(Vector.users[userid].username);
    },

    'selectUserTr': function(uid) {
        Vector.selectUser(uid);
        $(".listing").removeClass("selected");
        var listings = Vector.users[uid].listings?Vector.users[uid].listings:[];
        for(var i in listings) {
            $(".listing_" + listings[i]).addClass('selected');
        }
        Vector.showEditUserForm(Vector.users[uid]);
    },

    'saveUser': function(u) {
        api(u, function (response) {
            Vector.users[response.user.user_id]=response.user;
            Vector.generateUsersTable();
        });
    },

    'selectReservationTr': function(tr) {
        Vector.selectedReservationId=tr.id.substring(tr.id.indexOf('_')+1);
        tr = $(tr);
        tr.parent().find("tr").removeClass('selected');
        if(tr.hasClass('selected')) {
            tr.removeClass('selected');
        } else {
            tr.addClass('selected');
        }
    },

    'selectListingTr': function(tr) {
        Vector.selectedListingId=tr.id.substring(tr.id.indexOf('_')+1);
        tr = $(tr);
        var selecteduser = Vector.users[Vector.selectedUserId];
        if(tr.hasClass('selected')) {

        } else {
            if(selecteduser && confirm('Add "'+Vector.listings[Vector.selectedListingId].nickname+ '" to user "'+selecteduser.username+'"?')) {
                selecteduser.listings=addCSVItem(selecteduser.listings,Vector.selectedListingId);
                Vector.saveUser(selecteduser);
                tr.addClass('selected');
            }
        }

    },

    'showEditUserForm': function(user) {
        var form = $('form#editUser');
        form.closest('.row').show();
        form.find('input#edituser_username').val(user.username)
        form.find('input#edituser_fullname').val(user.fullname)
        form.find('input#edituser_commission').val(user.commission)
        form.find('input#edituser_email').val(user.email)

    },

    'saveUserListingsFromPicker': function(uid) {
        Vector.selectUserTr(uid);
        var mylistings  = $.map($("#user_listings_"+uid+" option:selected"),function(e) { return $(e).html() });
        Vector.saveUser({selectedUserId:uid, listings:mylistings.join()});
    },

    'generateUsersTable': function () {
        var html = "<thead><tr><th>Username</th><th>Fullname</th><th>Role</th><th>Commission</th><th>Listings</th></tr>";
        html += "<tbody>";
        for (var i in Vector.users) {
            var u = Vector.users[i];
            html += "<tr onClick='Vector.selectUserTr("+u.user_id+")' class='user user_"+u.user_id+" "+
                (u.user_id==Vector.selectedUserId?'selected':'')+"'>"+
                "<td class='user_username'>" + u.username + "</td>"+
                "<td class='user_fullname'>" + u.fullname + "</td>"+
                "<td class='user_role'>" + u.role + "</td>"+
                "<td class='user_commission'>" + u.commission + "</td>"+
                "<td class='user_listings'>";

            var i=0;
            if(u.listings) {
                var listings = u.listings;
                for (var l in listings) {
                   i++;
                }
            }
            html += i+"</td></tr>";
        }
        html += "</tbody>";

        $('#usersTable').html(html).DataTable();
    },
    'addListingToUser': function() {
        var listingIdToAdd = $("#user_editlistingid").val();
        api({listingId:listingIdToAdd},function(response) {
            if('listing' in response) {
                Vector.dashboardData.listings[listingIdToAdd] = response.listing;
                Vector.generateUserListingTable();
            } else {
                //show error?
            }
        });
    },
    'removeListingFromUser': function() {
        var listingIdToRemove = $("#user_editlistingid").val();
        api({listingId: listingIdToRemove},function() {
            delete(Vector.dashboardData.listings[listingIdToRemove]);
            Vector.generateUserListingTable();
        });
    },

    'generateListingsTable': function() {
       /* var html = "<thead><tr><th>id</th><th>name</th><th>title</th><th>address</th><th>price</th><th>cleaning</th></tr>";
        html += "<tbody>";
        for (var i in Vector.listings) {
            var l = Vector.listings[i];
            html += "<tr class='listing listing_"+l._id+"' id='listing_"+l._id+"' onClick='Vector.selectListingTr(this)'><td><a href='https://app.guesty.com/listings/"+l._id+"'>" + l._id + "</a></td><td>" + l.nickname + "</td><td>"+l.title+"</td><Td>"+l.address_full+"</Td>"+
                "<td>" + l.basePrice + "</td><td>" + l.cleaningFee + "</td></tr>";
        }
        html += "</tbody>";
if($('#listingsTableWrapper').length)
        $('#listingsTable_wrapper').parent().html('<table id="listingsTable" class="compact hover row-border">'+html+'</table>');
else $('#listingsTable').html(html);
"*/

        $("#listingsTableSection").html("<h3>Listings</h3><table class='p-1 table w-100'><thead></thead><tbody></tbody><tfoot></tfoot></table>");
        var listingArray = [];
        for (var i in Vector.listings) {
                listingArray.push(Vector.listings[i]);
        }
        $('#listingsTableSection').find("table").on("draw.dt", function (){
            setTimeout(function () {
                $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
            }, 200);
            }).DataTable({
            sScrollX: "100%",
            sScrollXInner: "110%",
            bScrollCollapse: true,
            data: listingArray,
            errMode: 'none',
            columns: [
                {data: '_id', title: 'id', fnCreatedCell: Vector.guestyListingDatatableLink},
                {data: 'nickname', title:'nickname'},
                {data: 'title', title:'title'},
                {data: 'address_full', title:'address'},
                {data: 'basePrice', title:'price'},
                {data: 'cleaningFee', title:'cleaning'}
            ],
            createdRow: function (row, data, index) {
                $(row).addClass('listing');
                $(row).attr('id', 'listing_' + data['_id']);
                $(row).click(function () {
                    Vector.selectListingTr(this);
                });
            },
            drawCallback: function(settings) {
                Vector.selectUserTr(Vector.selectedUserId);
            }
        });
        Vector.selectUserTr(Vector.selectedUserId);



        var airbnb_link = function (nTd, sData, oData, iRow, iCol) {
            $(nTd).html("<a target='_blank' href='https://airbnb.com/rooms/" + oData.airbnb_id + "'>" + oData.airbnb_id + "</a>");
        };
        var editable_field = function (nTd, sData, oData, iRow, iCol) {
            $(nTd).click({id: oData._id, iCol: iCol}, Vector.addUpdateInputField);
        };

        $("#adminListingsTableSection").html("<h3>Active Listings</h3><table class='p-1 table w-100'><thead></thead><tbody></tbody><tfoot></tfoot></table>");
        var listingArray = [];
        for (var i in Vector.listings) {
            if (Vector.listings[i].isListed != '0')
                listingArray.push(Vector.listings[i]);
        }

        try {
            $("#adminListingsTableSection").find("table").on("draw.dt", function (){
                setTimeout(function () {
                    $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
                }, 200);
                }).DataTable({
                sScrollX: "100%",
                sScrollXInner: "110%",
                bScrollCollapse: true,
                data: listingArray,
                errMode: 'none',
                columns: [
                    {data: "nickname", title: "Name", fnCreatedCell: Vector.guestyListingDatatableLink},
                    {data: "airbnb_id", title: "Airbnb", fnCreatedCell: function (nTd, sData, oData, iRow, iCol) {
                        $(nTd).html("<a href='http://www.airbnb.com/rooms/'"+ oData.airbnb_id +"' target='_blank' title='Visit AirBNB page of this listing'><img src='../images/airbnb-logo.png' height=16px>&nbsp;</a>");}
                    },
                    {data: "homeaway_id", title: "HomeAway"},
                    {data: "rentalsUnited_id", title: "RentalsUnited"}
                ]
            });
        } catch(e) { console.log(e); }
        $("#adminInactiveListingsTableSection").html("<h3>Inactive Listings</h3><table class='p-1 table w-100'><thead></thead><tbody></tbody><tfoot></tfoot></table>");
        var inactiveListingArray = [];
        var unlistedListingArray = [];
        for(var i in Vector.inactiveListings) {
            if(Vector.inactiveListings[i].active=='0')
                inactiveListingArray.push(Vector.inactiveListings[i]);
            else if(Vector.inactiveListings[i].isListed=='0') {
                unlistedListingArray.push(Vector.inactiveListings[i]);
            }
        }
        try {
            $("#adminInactiveListingsTableSection").find("table").on("draw.dt", function (){
                setTimeout(function () {
                    $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
                }, 200);
                }).DataTable({
                sScrollX: "100%",
                sScrollXInner: "110%",
                bScrollCollapse: true,
                data: inactiveListingArray,
                errMode: 'none',
                columns: [
                    {data: "nickname", title: "Name", fnCreatedCell: Vector.guestyListingDatatableLink},
                    {data: "airbnb_id", title: "Airbnb", fnCreatedCell: airbnb_link},
                    {data: "homeaway_id", title: "HomeAway"},
                    {data: "rentalsUnited_id", title: "RentalsUnited"}
                ]
            });
        } catch(e) { console.log(e); }
        $("#adminUnlistedListingsTableSection").html("<h3>Unlisted Active Listings</h3><table class='p-1 table w-100'><thead></thead><tbody></tbody><tfoot></tfoot></table>");
        try {
            $("#adminUnlistedListingsTableSection").find("table").on("draw.dt", function (){
                setTimeout(function () {
                    $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
                }, 200);
                }).DataTable({
                sScrollX: "100%",
                sScrollXInner: "110%",
                bScrollCollapse: true,
                data: unlistedListingArray,
                errMode: 'none',
                columns: [
                    {data: "nickname", title: "Name", fnCreatedCell: Vector.guestyListingDatatableLink},
                    {data: "airbnb_id", title: "Airbnb", fnCreatedCell: airbnb_link},
                    {data: "homeaway_id", title: "HomeAway"},
                    {data: "rentalsUnited_id", title: "RentalsUnited"}
                ]
            });
        } catch(e) { console.log(e); }
        $("#adminListingsBreakdownTableSection").html("<h3>Listings Breakdown</h3><table class='p-1 table w-100'><thead></thead><tbody></tbody><tfoot></tfoot></table>");
        try {
            $("#adminListingsBreakdownTableSection").find("table").DataTable({
                data: listingArray,
                errMode: 'none',
                columns: [
                    {data: '_id', title: 'Name', fnCreatedCell: Vector.guestyListingDatatableLink, "render": function (data, type, row) {
                        if (type === 'filter') return row.nickname;
                    }},
                    {data: "airbnb_id", title: "Airbnb", fnCreatedCell: airbnb_link},
                    {data: "title", title: "Title"},
                    {data: "bedrooms", title: "Bedrooms"},
                    {data: "accommodates", title: "Capacity"},
                    {data: "address_city", title: "City"},
                ]
            });
        } catch(e) { console.log(e); }
    }
}

