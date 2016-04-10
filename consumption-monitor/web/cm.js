/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.0.2
 */

sn.config.debug = true;
sn.config.defaultTransitionMs = 600;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.sourceColorMappingParams = {};
sn.runtime.excludeSources = new sn.Configuration();

function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	if ( sn.runtime.powerMinuteChart !== undefined ) {
		sn.runtime.powerMinuteChart.regenerate();
		sn.ui.adjustDisplayUnits(sn.runtime.powerMinuteContainer, 'W', sn.runtime.powerMinuteChart.yScale());
	}
	if ( sn.runtime.energyHourChart !== undefined ) {
		sn.runtime.energyHourChart.regenerate();
		sn.ui.adjustDisplayUnits(sn.runtime.energyHourContainer, 'Wh', sn.runtime.energyHourChart.yScale());
	}
}

function setupOutdatedMessage(endDate) {
	// if the data is stale by an hour or more, display the "outdated" message
	var format;
	if ( new Date().getTime() - endDate.getTime() >= (1000 * 60 * 60) ) {
		format = d3.time.format('%d %b %Y %H:%M');
		d3.select('#outdated-msg').style('display', 'block').select('.value').text(format(endDate));
	} else {
		d3.select('#outdated-msg').style('display', 'none');
	}
}

function colorForDataTypeSource(dataType, sourceId, sourceIndex) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.colorData[mappedSourceId];
}

function datumDate(datum) {
	if ( datum.date ) {
		return datum.date;
	}
	if ( datum.localDate ) {
		return sn.format.dateTimeFormat.parse(datum.localDate +' ' +datum.localTime);
	}
	if ( datum.created ) {
		return sn.timestampFormat.parse(datum.created);
	}
	return null;
}

function datumDayKey(datum) {
	if ( datum.localDate ) {
		return datum.localDate;
	}
	if ( datum.date ) {
		return (datum.date.getUTCFullYear() + '-'
			+ (datum.date.getUTCMonth() < 9 ? '0' : '') + (datum.date.getUTCMonth()+1)
			+ (datum.date.getUTCDate() < 10 ? '0' : '') + datum.date.getUTCDate());
	}
	return null;
}

function chartDataCallback(dataType, datum) {
	var dayAgg = this.stashedData('dayAgg'),
		key,
		dayGroup;

	// create date property
	datum.date = datumDate(datum);

	key = datumDayKey(datum);
	if ( !key ) {
		return;
	}
	dayGroup = dayAgg[key];
	if ( !dayGroup ) {
		dayGroup = { key : key, sum : 0, count : 0 };
		dayAgg[key] = dayGroup;
	}
	if ( datum.wattHours ) {
		dayGroup.sum += datum.wattHours;
		dayGroup.count += 1;
	}
}

function sourceExcludeCallback(dataType, sourceId) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.excludeSources.enabled(mappedSourceId);
}

function xAxisTickAggregateCallback(d, i, x, fmt) {
	var chart = this,
		dayAgg, dayGroup;
	if ( d.getUTCHours() === 12 ) {
		dayAgg = chart.stashedData('dayAgg');
		dayGroup = (dayAgg ? dayAgg[sn.format.dateFormat(d)] : undefined);
		// only show the aggregate value for days we have complete data for
		if ( dayGroup !== undefined && d3.time.day.utc.floor(d).getTime() >= x.domain()[0].getTime() ) {
			return String(d3.round(dayGroup.sum / chart.yScale(), 2));
		}
	}
	return fmt(d, i);
}

// Watt stacked area chart
function setupGroupedLayerChart(container, chart, parameters, endDate, sourceMap) {
	var queryRange = sn.api.datum.loaderQueryRange(parameters.aggregate, sn.env, endDate);
	var plotPropName = parameters.plotProperties[parameters.aggregate];

	container.selectAll('.time-count').text(queryRange.timeCount);
	container.selectAll('.time-unit').text(queryRange.timeUnit);

	sn.api.datum.multiLoader([
		sn.api.datum.loader(sourceMap[sn.env.dataType], sn.runtime.urlHelper,
			queryRange.start, queryRange.end, parameters.aggregate)
	]).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === 1) ) {
			sn.log("Unable to load data for {0} chart: {1}", parameters.aggregate, error);
			return;
		}

		// note the order we call load dictates the layer order of the chart... each call starts a new layer on top of previous layers
		chart.reset()
			.stash({}, 'dayAgg')
			.load(results[0], sn.env.dataType)
			.regenerate();
		sn.ui.adjustDisplayUnits(container, (parameters.aggregate === 'TenMinute' ? 'W' : 'Wh'), chart.yScale());
	}).load();
}

function setupSourceGroupMap() {
	var map = {},
		sourceArray;
	sourceArray = (Array.isArray(sn.env.sourceIds) ? sn.env.sourceIds : sn.env.sourceIds.split(/\s*,\s*/));
	map[sn.env.dataType] = sourceArray;

	sn.runtime.sourceGroupMap = map;
}

function sourceSets(regenerate) {
	if ( !sn.runtime.sourceGroupMap || regenerate ) {
		setupSourceGroupMap();
	}
	return [
		{ nodeUrlHelper : sn.runtime.urlHelper, sourceIds : sn.runtime.sourceGroupMap[sn.env.dataType] }
	];
}

function updateReadings() {
	d3.json(sn.runtime.urlHelper.mostRecentURL(sn.runtime.sourceGroupMap[sn.env.dataType]), function(json) {
		if ( !(json && json.data && Array.isArray(json.data.results)) ) {
			sn.log('No data available for node {0}', sn.runtime.urlHelper.nodeId);
			return;
		}
		// totalPower, in kW
		var totalPower = d3.sum(json.data.results, function(d) {
			return (d.watts ? d.watts : 0);
		}) / 1000;
		d3.select('#total-power-value').html(Number(totalPower).toFixed(2));
	});
}

function setup(repInterval) {
	sn.runtime.reportableEndDate = repInterval.eDate;
	if ( sn.runtime.sourceColorMap === undefined ) {
		sn.runtime.sourceColorMap = sn.color.sourceColorMapping(sn.runtime.sourceGroupMap, sn.runtime.sourceColorMappingParams);

		// we make use of sn.colorFn, so stash the required color map where expected
		sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

		// create copy of color data for reverse ordering so labels vertically match chart layers
		sn.ui.colorDataLegendTable('#source-labels', sn.runtime.sourceColorMap.colorMap.slice().reverse(), legendClickHandler, function(s) {
			if ( sn.env.linkOld === 'true' ) {
				s.html(function(d) {
					return '<a href="' +sn.runtime.urlHelper.nodeDashboard(d) +'">' +d +'</a>';
				});
			} else {
				s.text(Object);
			}
		});
	}

	setupGroupedLayerChart(sn.runtime.powerMinuteContainer,
		sn.runtime.powerMinuteChart,
		sn.runtime.powerMinuteParameters,
		sn.runtime.reportableEndDate,
		sn.runtime.sourceGroupMap);

	setupGroupedLayerChart(sn.runtime.energyHourContainer,
		sn.runtime.energyHourChart,
		sn.runtime.energyHourParameters,
		sn.runtime.reportableEndDate,
		sn.runtime.sourceGroupMap);

	// every minute update reading values
	if ( sn.runtime.updateTimer === undefined ) {
		updateReadings();
		sn.runtime.updateTimer = setInterval(updateReadings, 60 * 1000);
	}
}

function setupUI() {
	d3.selectAll('.node-id').text(sn.env.nodeId);
	d3.select('#num-days').text(sn.env.numDays);
	d3.select('#num-hours').text(sn.env.numHours);
	d3.selectAll('.watt-chart .dataType').text((function() {
		if ( sn.env.dataType === 'Consumption' ) {
			return 'use';
		}
		return 'output';
	})());
	d3.selectAll('.watthour-chart .dataType').text((function() {
		if ( sn.env.dataType === 'Consumption' ) {
			return 'consumption';
		}
		return 'production';
	})());
	d3.selectAll('.total-power .dataType').text((function() {
		if ( sn.env.dataType === 'Consumption' ) {
			return 'Use';
		}
		return 'Power';
	})());
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 11,
		sourceIds : 'Main',
		dataType : 'Consumption',
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		wiggle : 'true',
		linkOld : false
	});

	sn.runtime.wChartRefreshMs = sn.env.minutePrecision * 60 * 1000;

	sn.runtime.powerMinuteContainer = d3.select(d3.select('#day-watt').node().parentNode);
	sn.runtime.powerMinuteParameters = new sn.Configuration({
		aggregate : 'TenMinute',
		wiggle : (sn.env.wiggle === 'true'),
		plotProperties : {TenMinute : 'watts', Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.powerMinuteChart = sn.chart.powerAreaChart('#day-watt', sn.runtime.powerMinuteParameters)
		.colorCallback(colorForDataTypeSource)
		.dataCallback(chartDataCallback)
		.sourceExcludeCallback(sourceExcludeCallback);

	sn.runtime.energyHourContainer = d3.select(d3.select('#week-watthour').node().parentNode);
	sn.runtime.energyHourParameters = new sn.Configuration({
		aggregate : 'Hour',
		plotProperties : {Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.energyHourChart = sn.chart.energyBarOverlapChart('#week-watthour', sn.runtime.energyHourParameters)
		.colorCallback(colorForDataTypeSource)
		.dataCallback(chartDataCallback)
		.xAxisTickCallback(xAxisTickAggregateCallback)
		.sourceExcludeCallback(sourceExcludeCallback);

	sn.runtime.urlHelper = sn.api.node.nodeUrlHelper(sn.env.nodeId);

	setupUI();

	// get available sources, followed by available data range
	function getRangeForSources(error, sourceIds) {
		if ( Array.isArray(sourceIds) === false ) {
			return;
		}
		sn.env.sourceIds = sourceIds;
		sn.api.node.availableDataRange(sourceSets(), function(reportableInterval) {
			setup(reportableInterval);
			if ( sn.runtime.refreshTimer === undefined ) {
				// refresh chart data on interval
				sn.runtime.refreshTimer = setInterval(function() {
					sn.api.node.availableDataRange(sourceSets(), function(repInterval) {
						var jsonEndDate = repInterval.eDate;
						if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
							setup(repInterval);
						} else {
							setupOutdatedMessage(jsonEndDate);
						}
					});
				}, sn.runtime.wChartRefreshMs);
			}
		});
	}
	if ( sn.env.sourceIds.length > 0 ) {
		getRangeForSources(null, sn.env.sourceIds.split(/\s*,\s*/));
	} else {
		sn.datum.availableSources(sn.runtime.urlHelper, getRangeForSources);
	}
}
