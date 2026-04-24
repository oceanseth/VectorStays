/**
 Template Name: Ubold Dashboard
 Author: CoderThemes
 Email: coderthemes@gmail.com
 File: Chartjs
 */


!function($) {
    "use strict";

    var ChartJs = function() {};
    var customLabelFunction = function(tooltipItem, data) {
        // tooltipItem: datasetIndex index x xLabel y yLabel
        // data: datasets, labels
        if(parseFloat(tooltipItem.yLabel)==0){ return '';}
        if(data.datasets[tooltipItem.datasetIndex].dataType=='amount')
            return (data.datasets[tooltipItem.datasetIndex].label || tooltipItem.xLabel) + ": " + tooltipItem.yLabel;
        if(data.datasets[tooltipItem.datasetIndex].dataType=='percent')
            return (data.datasets[tooltipItem.datasetIndex].label || tooltipItem.xLabel) + ": "+(parseFloat(tooltipItem.yLabel)).toFixed(0)+'%';
        if(data.datasets[tooltipItem.datasetIndex].dataType=='percentHorizontal')
            return (data.datasets[tooltipItem.datasetIndex].label || tooltipItem.yLabel) + ": "+(parseFloat(tooltipItem.xLabel)).toFixed(0)+'%';
        if(data.datasets[tooltipItem.datasetIndex].dataType=='valuewithpercent')
            return (data.datasets[tooltipItem.datasetIndex].label || tooltipItem.xLabel) + ": " + parseFloat(tooltipItem.yLabel) + " (" + (100*parseFloat(tooltipItem.yLabel) / data.datasets[tooltipItem.datasetIndex].totals[tooltipItem.index]).toFixed(0) + '%)';
        if(data.datasets[tooltipItem.datasetIndex].dataType=='float')
            return (data.datasets[tooltipItem.datasetIndex].label || tooltipItem.xLabel) + ": "+ (parseFloat(tooltipItem.yLabel)).toFixed(data.datasets[tooltipItem.datasetIndex].precision||0);
        return (data.datasets[tooltipItem.datasetIndex].label || tooltipItem.xLabel) + ": " + tooltipItem.yLabel.moneyString();
    };

    ChartJs.prototype.respChart = function(id,type, data, options) {
        if(!options) options = {
            legend: {
                display:false
            }
        };
        options.animation = false;
        options.animations = false;
        var chartLabel=options.chartTitle || data.chartTitle || data.datasets[0].label;

        if(!options.tooltips) options.tooltips = {};
        if(!options.tooltips.callbacks) options.tooltips.callbacks = {};
        if(!options.tooltips.callbacks.label)
        {
            options.tooltips.callbacks.label =  customLabelFunction;
        }
        options.maintainAspectRatio=false;
        options.responsiveAnimationDuration = 0;
        //options.responsive=false;

        for(var d in data.datasets) {
            data.datasets[d].data.forEach(function(v,i) {
                if(!isNaN(v))
                data.datasets[d].data[i]=parseFloat(v).toFixed(2);
            });
        }

        //delete(data.datasets[0].label);
        var html="<div class='position-absolute text-left' style='width:calc(100% - 30px); max-height:500px; left:15px; top:5px; font-size: 20px;'>"+
            "<h4 class='ml-3 mt-2 header-title float-left'>"+chartLabel+"</h4>"+
            "<a style='float:right;' onclick='javascript:$(this).parent().parent().remove();'><i class='md md-close'></i></a>"+
            "<a style='float:right;' class='downloadPNG'><i class='md md-image'></i></a>"+
            "<a style='float:right;' onclick='javascript:Vector.toggleGraphSize($(this).parent().parent().parent())'><i class='md md-fullscreen'></i></a>"+
            "<a style='float:right;' onclick='javascript:Vector.toggleGraphSettings($(this).parent().parent().parent())'><i class='md md-settings'></i></a>"+
            (('ADRvDBA' in options)?"<a style='float:right;' data-toggle='modal' data-target='#ADRvDBASettings'><i class='md md-edit'></i></a>":"")+
            (('datatableHTML' in options)?"<a class='downloadCSV monthlyRevByChannel'><img src='../images/xls-logo.svg' class='excelIcon'></a><a style='float:right;' id='toggleData_"+id+"'><i class='md md-grid-on'></i></a>":"")+
            (('swapTable' in options)?"<a style='float:right;' class='toggleData_"+id+"'><i class='md md-grid-on'></i></a>":"")+
            (('revByCheckin' in options)?"<a class='downloadCSV revByCheckinCSV'><img src='../images/xls-logo.svg' class='excelIcon'></a>":"")+
            (('revByBooking' in options)?"<a class='downloadCSV revByBookingCSV'><img src='../images/xls-logo.svg' class='excelIcon'></a>":"")+
            (('dateparts' in options)?"<span class='chartby' style='margin-right:15px; margin-top:5px; float:right;'>By <select id='breakApartChart_"+id+"' data-containerCssClass='chartby' data-dropdownCssClass='chartby'><option value='day'>day</option><option value='month'>month</option><option value='year'>year</option></select></span>":"")+
            "</div><canvas id=\""+id+"\" class='mt-4' height='500' style='max-height:500px!important;'></canvas>"+
            "<div class='settings' style='width:100%; white-space: nowrap; height:100px; top:20px; background-color:#fff; display:none;'>"+
            "<h3>Chart Filters</h3>"+
            "<input class='filtertaglist' readonly='true' style='width:100%;' data-role=\"tagsinput\" id='chartfilterlist_"+id+"'><br/>"+
            "Save As: <input id='customchartname_"+id+"' type='text' class='form-control' style='width:200px; display:inline;    padding: .40rem .85rem; margin-top:2px;' value='"+chartLabel.split("<")[0]+"'/> <button class='btn btn-default waves-effect waves-light' id='chartsavetocustom_"+id+"' style='width:80px;margin-top: -3px;'>Save</button>"+
            "</div>";
        ;
        var selector="#"+id;
        $(selector).parent().html(html);


        if('datatableHTML' in options) {
            var tableElement  = $("<table id='" + id + "' style='margin-top:20px; width:inherit;' class='p-1 table'>" + options.datatableHTML + "</table>");
            var canvasElement = $('#'+id);
            $("#toggleData_"+id).click(function(){
                if($("#"+id).prop('tagName')=='TABLE') {
                    $("#"+id).replaceWith(canvasElement);
                } else {
                    $('#'+id).replaceWith(tableElement);
                }
            });
        }

        if('swapTable' in options) {
            var parentContainer = '#' + id.replace(/Chart$/gi, '');
            $(".toggleData_"+id).click(function(){
                $(parentContainer).children().toggle()
            });
        }

        if('dateparts' in options) {
            $("#breakApartChart_"+id).val(options.dateparts);
            $("#breakApartChart_"+id).change(function() {Vector[options.redraw]({by:$("#breakApartChart_"+id).val()})});
        }

        //ridiculous css hack because this damn select2 widget is being applied and is confusing as fuck to style
        $("<style>")
            .prop("type", "text/css")
            .html("\
        span[aria-labelledby='select2-breakApartChart_"+id+"-container'].select2-selection {\
            font-size:10px;white-space:nowrap;height:20px!important;line-height:16px!important;\
        }\
        #select2-breakApartChart_"+id+"-container,\
        #select2-breakApartChart_"+id+"-container+span {\
            height:20px!important;line-height:16px!important;right:-3px\
        }").appendTo("head");

        $("#chartsavetocustom_"+id).click(function() {
            var chartObject = {
                chartName:$("#customchartname_"+id).val(),
                redraw: options.redraw,
                filters: options.selectedFilters||Vector.selectedFilters, //city or unit filters
                startDateFilter:options.startDate||Vector.startDateFilter,
                endDateFilter:options.endDate||Vector.endDateFilter

            };
            Vector.customCharts.append
            Vector.saveCustomCharts();
        });
        selector = $(selector);
        if(selector.get(0)==undefined) return; //if graph is not found because they removed it
        selector.parent().find("select").select2();
        var ctx = selector.get(0).getContext("2d");
        // pointing parent container to make chart js inherit its width
        var container = $(selector).parent();

        function getChartType(type) {
            var itsCapitalized = type.charAt(0) === type.charAt(0).toUpperCase();
            return itsCapitalized ? type.toLowerCase() : type;
        }

        function downloadPNG() {
            var downloadPNGButton = $(container).find('.downloadPNG');
            $(container).delegate(downloadPNGButton, 'click', function() {
                var image = ($(selector))[0].toDataURL('image/png');
                $(downloadPNGButton).attr('href', image);
                $(downloadPNGButton).attr('download', 'chart.png');
            })
        }

        // this function produce the responsive Chart JS
        function generateChart(){
            // make chart width fit with its container
            var ww = selector.attr('width', $(container).width() );
            var optionsWithDefault = Object.assign({}, options, {
                animation: {
                    onComplete: downloadPNG
                }
            });
           return new Chart(ctx, {type: getChartType(type),data:data,options:optionsWithDefault, responsiveAnimationDuration:0, animation:false});

        };

        // enable resizing matter
        $(window).resize( generateChart );

        // run function - render chart at first load
        var newChart = generateChart();
        selector.data('chart', newChart); //get access to the chart object after the chart is created
        return newChart;
    },

        $.ChartJs = new ChartJs, $.ChartJs.Constructor = ChartJs

}(window.jQuery);

var renderPercentColumn = function ( data, type, row ) {

    if(isNaN(data)) return "n/a";
    var number = (parseFloat(data)*100).toFixed(0)+"%";
    if(parseFloat(data)<.3)
        return "<span class='text-danger'>"+number+"</span>";
    else if(parseFloat(data)<.5)
        return "<span class='text-warning'>"+number+"</span>";
    return number;
};

var renderPercentColumnNoWarnings= function(data,type,row) {
    return (parseFloat(data)*100).toFixed(0)+"%";
};

