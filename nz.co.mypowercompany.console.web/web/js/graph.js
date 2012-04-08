/**
 * This is a slightly modified version of the viz.web javascript to display the graph.
 * 12/10/11
 * Max Duncan
 */

var featureConsumption = false;
var featureGridPrice = false;
var consumptionSourceId = '';
var mainChart;

var dateTimeDataFormat = '%Y-%m-%d %H:%M';
var dateDataFormat = '%Y-%m-%d';

/**
 * NodeChart constructor.
 * 
 * The opts object supports the following:
 * 
 * - consumptionSourceId:	the source ID of the consumption node to monitor
 * - feature:				object with consumption and gridPrice boolean flags
 * 
 * @param divId the name of the element to hold the chart (string)
 * @param nodeId the ID of the node (number)
 * @param interval date range interval, with startDate, endDate, sDate, eDate properties
 * @param opts object with NodeChart options (required)
 * @param chartOpts optional object with jqPlot options
 * @return NodeChart object
 */
function NodeChart(divId, nodeId, interval, opts, chartOpts) {
	
	this.divId = divId;
	this.nodeId = nodeId;
	this.interval = interval,
	this.opts = opts || {};
	this.chartOpts = chartOpts || {};
	this.pvWattHoursSeries = [];
	this.consumptionWattHoursSeries = [];
	this.gridPriceSeries = [];
	this.dateTicks = [];
	this.dateLabelFormat = null;
	this.dateTickInterval = null;
	this.numSeriesLoaded = 0;
	this.numSeries = 0;
	this.timeReportingLevel = false;
	this.consumptionSourceId = this.opts.consumptionSourceId;
	
	this.loadData = function() {
		this.pvWattHoursSeries = [];
		this.consumptionWattHoursSeries = [];
		this.gridPriceSeries = [];
		
		this.dateTicks = [];
		this.dateTickInterval = null;
		this.numSeriesLoaded = 0;
		this.showDaylight = false;
		
		this.numSeries = 3;
		
		var me = this;
		var queryParams = {
				nodeId: this.nodeId,
				startDate: this.interval.startDate,
				endDate: this.interval.endDate
			};
		var dt = this.interval.eDate.diff(this.interval.sDate, 'days', true);
		var endDateEOD = false;
		if ( dt <= 1 ) {
			queryParams.precision = 5;
			this.dateTickInterval = '4 hours';
		} else if ( dt <=  2 ) {
			queryParams.precision = 10;
			this.dateTickInterval = '6 hours';
		} else if ( dt <=  4 ) {
			queryParams.precision = 20;
			this.dateTickInterval = '12 hours';
		} else if ( dt <= 9 ) {
			if ( dt <= 6 ) {
				queryParams.precision = 30;
			}
			this.dateTickInterval = '1 day';
		} else if ( dt <= 21 ) {
			this.dateTickInterval = '2 days';
		} else if ( dt < 70 ) {
			this.dateTickInterval = '1 week';
		} else if ( dt < 145 ) {
			this.dateTickInterval = '2 weeks';
		} else if ( dt <= 310 ) {
			this.dateTickInterval = '1 month';
		} else if ( dt <= 730 ) {
			this.dateTickInterval = '2 months';
		} else if ( dt <= 1460 ) {
			this.dateTickInterval = '6 months';
		} else {
			this.dateTickInterval = '1 year';
		}
		
		if ( this.chartOpts.cursor.show && dt <= 10 ) {
			this.showDaylight = true;
		}
			
		if ( this.chartOpts.cursor.show && dt > 6 ) {
			// this is detailed chart, so specify hour-level up to 16 days, and 
			// day-level data up to 6 months range
			if ( dt < 16 ) {
				queryParams.aggregate = 'Hour';
				endDateEOD = true;
			} else if ( dt < 180 ) {
				queryParams.aggregate = 'Day';
			}
		}

		this.dateLabelFormat = '%#d %b ' +(this.dateTickInterval.search(/hour/i) != -1 ? '%y %H:%M' : '%Y');
		
		if ( queryParams.precision || endDateEOD ) {
			// make sure end date includes minutes
			queryParams.endDate = this.interval.eDate.strftime(dateTimeDataFormat);
		}
		this.timeReportingLevel = queryParams.precision != null 
			|| queryParams.aggregate == 'Minute' || queryParams.aggregate == 'Hour';

		// set up date ticks
		this.setupDateTicks();
		
		$.ajax({
			type: 'GET',
			url:'/solarquery/powerData.json',
			data: queryParams,
			dataType: 'json',
			traditional: true,
			success: function(data) {
					$(data.data).each(function(i, obj) {
						var dateVal = obj.localDate;
						if ( me.timeReportingLevel ) {
							dateVal += ' ' + obj.localTime;
						}
						me.pvWattHoursSeries.push([dateVal, obj.wattHours <= 0 ? 0 : obj.wattHours]);
					});
					me.numSeriesLoaded++;
					me.drawChart();
				}
		});
		var consumParams = queryParams;
		if ( this.consumptionSourceId ) {
			consumParams = {};
			$.extend(true, consumParams, queryParams);
			consumParams["properties['sourceId']"] = this.consumptionSourceId;
		}
		$.ajax({
			type: 'GET',
			url:'/solarquery/consumptionData.json',
			data: consumParams,
			dataType: 'json',
			traditional: true,
			success: function(data) {
					$(data.data).each(function(i, obj) {
						var dateVal = obj.localDate;
						if ( me.timeReportingLevel ) {
							dateVal += ' ' + obj.localTime;
						}
						me.consumptionWattHoursSeries.push([dateVal, obj.wattHours < 0 ? 0 : obj.wattHours]);
					});
					me.numSeriesLoaded++;
					me.drawChart();
				}
		});
		$.ajax({
			type: 'GET',
			url:'/solarquery/priceData.json',
			data: queryParams,
			dataType: 'json',
			traditional: true,
			success: function(data) {
					$(data.data).each(function(i, obj) {
						var dateVal = obj.localDate;
						if ( me.timeReportingLevel ) {
							dateVal += ' ' + obj.localTime;
						}
						me.gridPriceSeries.push([dateVal, obj.price < 0 ? 0 : obj.price]);
					});
					me.numSeriesLoaded++;
					me.drawChart();
				}
		});
			
		return this;
	};
	
	this.setupDateTicks = function() {
		// we assume here sDate always has time set to midnight
		var currDate = this.interval.sDate.clone();
		this.dateTicks.push([currDate.strftime(dateTimeDataFormat), ' ']);
		
		var intervalParts = this.dateTickInterval.split(' ');
        if ( intervalParts.length == 1 ) {
        	intervalParts = [1, intervalParts[0]];
        }
		
        if ( this.timeReportingLevel && intervalParts[1].search('day') != -1 ) {
        	// we have hourly data, but day interval, so make labels centered at noon, not midnight
        	currDate.add(12, 'hours');
        } else if ( intervalParts[1].search('week') != -1 ) {
        	// make week labels start on Monday
        	if ( currDate.getDay() < 1 ) {
        		currDate.add(1, 'day');
        	} else if ( currDate.getDay() > 1 ) {
        		currDate.add( 7 - currDate.getDay() + 1, 'day');
        	}
        } else if ( intervalParts[1].search('month') != -1 ) {
        	// make month labels start on 1st of month
        	if ( currDate.getDate() > 1 ) {
        		currDate.add(1, 'month');
        		currDate.setDate(1);
        	}
        } else {
        	// jump to next interval
        	currDate.add(intervalParts[0], intervalParts[1]);
        }
        
		while (  currDate.getTime() < this.interval.eDate.getTime() ) {
			this.dateTicks.push([currDate.strftime(dateTimeDataFormat), currDate.strftime(this.dateLabelFormat)]);
			currDate.add(intervalParts[0], intervalParts[1]);
		}
		
		this.dateTicks.push([this.interval.eDate.strftime(dateTimeDataFormat), ' ']);
	};
	
	this.changeDateRange = function(startDate, endDate) {
		this.interval.sDate = startDate;
		this.interval.eDate = endDate;
		this.interval.startDate = startDate.strftime(dateDataFormat);
		this.interval.endDate = endDate.strftime(dateDataFormat);
		this.loadData();
	};

	this.drawChart = function() {
		if ( this.numSeriesLoaded < this.numSeries ) {
			// don't draw chart until all series loaded
			return this;
		}
		var opts = {};
		$.extend(true, opts, {
			axes: {
				xaxis:{ 
					renderer: $.jqplot.DateAxisRenderer, 
					pad: 0, 
					ticks: this.dateTicks,
					//tickInterval:this.dateTickInterval,
					tickOptions: {formatString:this.dateLabelFormat}
				},
				yaxis:{min:0,  pad:1},
				y2axis:{min:0,  pad:1},
				y3axis:{min:0, pad:1, tickOptions:{formatString:'$%.2f'}}
			},
			axesDefaults:{useSeriesColor:true},
			seriesDefaults:{lineWidth:2, showMarker:false, pointLabels:{show:false}},
			series:[
			        {label:'Consumption Wh', yaxis:'yaxis'/*, renderer:$.jqplot.BarRenderer, rendererOptions: {barMargin: 1}*/},
			        {label:'PV Wh', yaxis:'yaxis'/*, renderer:$.jqplot.BarRenderer, rendererOptions: {barMargin: 1}*/},
			        {label:'Grid Price', yaxis:'y2axis', lineWidth:1}
			        ]/*,
			        stackSeries: true*/
		}, this.chartOpts);
		$('#'+this.divId).empty();
		var seriesArray = [this.consumptionWattHoursSeries, this.pvWattHoursSeries, this.gridPriceSeries];
		$.jqplot(this.divId, seriesArray,  opts);
		/*if ( this.showDaylight ) {
			new DaylightCanvas(this.nodeId, $('#'+this.divId +' canvas.jqplot-series-canvas'), 
					this.interval.sDate.clone(), this.interval.eDate.clone()).showDaylight();
		}*/
		$(document).trigger("NodeChartReady", [this]);
		return this;
	};
}

function setupChart(nodeId, interval) {

	
	// Populate the graph
	consumptionSourceId =  $('#consumptionSourceId').val();
	featureConsumption = $('#feature-consumption').val() == 'true' ? true : false;
	featureGridPrice = $('#feature-gridPrice').val() == 'true' ? true : false;
	
	mainChart = new NodeChart('chart-div', 
			nodeId, 
			interval, {
				consumptionSourceId: consumptionSourceId,
				feature: {consumption: featureConsumption, gridPrice: featureGridPrice}
			}, {
				seriesColors : ['#FF790F', '#324CFF', '#0B9500', '#FF130B'],
				grid: {background: 'transparent', shadow: false},
				legend:{show:true, location:'nw'},
				cursor: {show:true, tooltipLocation:'sw', zoom:true, clickReset:true},
				axes: {
					yaxis: {
						label:'Watt hours',
						labelRenderer:$.jqplot.CanvasAxisLabelRenderer,
						labelOptions:{
							enableFontSupport:true,
							angle:-90
						}
					},
					y2axis: {
						label:'NZD / MWh', // TODO use currency and unit from data
						labelRenderer:$.jqplot.CanvasAxisLabelRenderer,
						labelOptions:{
							enableFontSupport:true,
							angle:90
						}
					}
				}
			});
	mainChart.loadData();
}

