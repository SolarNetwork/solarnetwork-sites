/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.4
 * @require solarnetwork-d3-chart-power-area-overlap 1.0.0
 */

sn.config.debug = true;
sn.runtime.excludeSources = new sn.Configuration();

//adjust display units as needed (between W and kW, etc)
function adjustChartDisplayUnits(chartKey, baseUnit, scale, unitKind) {
	var unit = (scale === 1000000000 ? 'G' : scale === 1000000 ? 'M' : scale === 1000 ? 'k' : '') + baseUnit;
	d3.selectAll(chartKey +' .unit').text(unit);
	if ( unitKind !== undefined ) {
		d3.selectAll(chartKey + ' .unit-kind').text(unitKind);
	}
}

//handle clicks on legend handler
function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	if ( sn.runtime.powerIOAreaChart !== undefined ) {
		sn.runtime.powerIOAreaChart.regenerate();
		adjustChartDisplayUnits('.power-area-chart', 
				(sn.runtime.powerIOAreaChart.aggregate() === 'TenMinute' ? 'W' : 'Wh'), 
				sn.runtime.powerIOAreaChart.yScale(),
				(sn.runtime.powerIOAreaChart.aggregate() === 'TenMinute' ? 'power' : 'energy'));
	}
}

function sourceExcludeCallback(dataType, sourceId) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return ((!sn.runtime.sourceGroupMap['Control'] || sn.runtime.sourceGroupMap['Control'].indexOf(mappedSourceId) < 0) 
			&& sn.runtime.excludeSources.enabled(mappedSourceId));
}

//show/hide the proper range selection based on the current aggregate level
function updateRangeSelection() {
	d3.selectAll('#details div.range').style('display', function() {
		return (d3.select(this).classed(sn.runtime.powerIOAreaParameters.aggregate.toLowerCase()) ? 'block' : 'none');
	});
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
		return sn.dateTimeFormat.parse(datum.localDate +' ' +datum.localTime);
	}
	if ( datum.created ) {
		return sn.timestampFormat.parse(datum.created);
	}
	return null;
}

function chartDataCallback(dataType, datum) {
	// create date property
	datum.date = datumDate(datum);
}

function controlDrawCallback(svgAnnotRoot) {
	var chart = this;
	var xDomain = chart.xDomain();
	var controlData = (!sn.runtime.sourceGroupMap['Control'] ? [] : chart.stashedData('Control').filter(function(d) {
		// filter any data outside our chart domain, assigning Date objects along the way
		var date = datumDate(d);
		if ( date.getTime() < xDomain[0].getTime() || date.getTime() > xDomain[1].getTime() ) {
			return false;
		}
		d.date = date;
		return true;
	}));
	var yMax = chart.yDomain()[1];
	var lineGenerator = d3.svg.line()
		.interpolate('cardinal')
		.x(function(d) {
			var date = datumDate(d);
			var x = chart.scaleDate(date);
			return x;
		})
		.y(function(d) {
			var val = (d.val / 100) * yMax;
			if ( isNaN(val) ) {
				val = 0;
			}
			var y = chart.scaleValue(val);
			return y;
		});
	var line = svgAnnotRoot.selectAll('path.control').data(controlData ? [controlData] : [], function(d) {
		return (d.length ? d[0].sourceId : null);
	});
	line.transition().duration(chart.transitionMs())
		.attr('d', lineGenerator);
	line.enter().append('path')
			.attr('class', 'control')
			.attr('d', lineGenerator)
			.style('opacity', 1e-6)
		.transition().duration(chart.transitionMs())
			.style('opacity', '0.9');
	line.exit().transition().duration(chart.transitionMs())
		.style('opacity', 1e-6)
		.remove();
}

// Watt stacked area overlap chart
function powerIOAreaChartSetup(endDate) {
	setupPowerAreaChart(
		sn.runtime.powerIOAreaContainer,
		sn.runtime.powerIOAreaChart,
		sn.runtime.powerIOAreaParameters,
		endDate,
		sn.runtime.sourceGroupMap);
}

function setupPowerAreaChart(container, chart, parameters, endDate, sourceMap) {
	var queryRange = sn.datum.loaderQueryRange(parameters.aggregate, sn.env, endDate);
	var plotPropName = parameters.plotProperties[parameters.aggregate];
	var loadSets = [
		sn.datum.loader(sourceMap['Consumption'], sn.runtime.consumptionUrlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate),
		sn.datum.loader(sourceMap['Generation'], sn.runtime.urlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate)
	];

	if ( sourceMap['Control'] && sourceMap['Control'].length > 0 ) {
		// also load the control data, without any aggregate if using TenMinute aggregate to get the raw data
		loadSets.splice(loadSets.length, 0, sn.datum.loader(sourceMap['Control'], sn.runtime.controlUrlHelper,
			queryRange.start, queryRange.end, (parameters.aggregate === 'TenMinute' ? undefined : parameters.aggregate)));
	}
	
	container.selectAll('.time-count').text(queryRange.timeCount);
	container.selectAll('.time-unit').text(queryRange.timeUnit);
	
	sn.datum.multiLoader(loadSets).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === loadSets.length) ) {
			sn.log("Unable to load data for Energy Bar chart: {0}", error);
			return;
		}
		// note the order we call load dictates the layer order of the chart... each call starts a new layer on top of previous layers
		chart.reset()
			.load(results[0], 'Consumption')
			.load(results[1], 'Generation');
		if ( results.length > 2 ) {
			chart.stash(results[2], 'Control');
		}
		chart.regenerate();
		sn.log("Power Area chart watt range: {0}", chart.yDomain());
		sn.log("Power Area chart time range: {0}", chart.xDomain());
		sn.adjustDisplayUnits(container, 
			(sn.runtime.powerIOAreaChart.aggregate() === 'TenMinute' ? 'W' : 'Wh'),
			chart.yScale(),
			(sn.runtime.powerIOAreaChart.aggregate() === 'TenMinute' ? 'power' : 'energy'));
	}).load();
}

function setup(repInterval) {
	sn.runtime.reportableEndDate = repInterval.eDate;
	if ( sn.runtime.sourceColorMap === undefined ) {
		sn.runtime.sourceColorMap = sn.sourceColorMapping(sn.runtime.sourceGroupMap, {
			displayColor : function(dataType) {
				return (dataType === 'Consumption' ? colorbrewer.Blues : 
					dataType === 'Generation' ? colorbrewer.Greens 
					: colorbrewer.Oranges );
			}
		});
	
		// we make use of sn.colorFn, so stash the required color map where expected
		sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

		// set up form-based details
		d3.selectAll('#details .consumption').style('color', 
				sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Consumption'][sn.runtime.sourceGroupMap['Consumption'][0]]]);
		d3.selectAll('#details .generation').style('color', 
				sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Generation'][sn.runtime.sourceGroupMap['Generation'][0]]]);
		if ( sn.runtime.sourceGroupMap['Control'] ) {
			d3.selectAll('#details .control').style('color', 
					sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Control'][sn.runtime.sourceGroupMap['Control'][0]]]);
		}
		// create copy of color data for reverse ordering so labels vertically match chart layers
		sn.colorDataLegendTable('#source-labels', sn.runtime.sourceColorMap.colorMap, legendClickHandler, function(s) {
			if ( sn.env.linkOld === 'true' ) {
				s.html(function(d) {
					return '<a href="' +sn.runtime.urlHelper.nodeDashboard(d) +'">' +d +'</a>';
				});
			} else {
				s.text(Object);
			}
		});
	}

	updateRangeSelection();

	powerIOAreaChartSetup(sn.runtime.reportableEndDate);
}

function setupUI() {
	d3.selectAll('.node-id').text(sn.env.nodeId);

	// update details form based on env
	d3.selectAll('#details input')
		.on('change', function(e) {
			var me = d3.select(this);
			var propName = me.attr('name');
			var getAvailable = false;
			if ( this.type === 'checkbox' ) {
				sn.env[propName] = me.property('checked');
			} else {
				sn.env[propName] = me.property('value');
			}
			if ( propName === 'consumptionNodeId' ) {
				sn.runtime.consumptionUrlHelper = sn.datum.nodeUrlHelper(sn.env[propName]);
				getAvailable = true;
			} else if ( propName === 'nodeId' ) {
				sn.runtime.urlHelper = sn.datum.nodeUrlHelper(sn.env[propName]);
				getAvailable = true;
			} else if ( propName === 'controlNodeId' ) {
				sn.runtime.controlUrlHelper = sn.datum.nodeUrlHelper(sn.env[propName]);
				getAvailable = true;
			} else if ( propName === 'sourceIds'|| propName === 'consumptionSourceIds' || propName === 'controlSourceIds' ) {
				getAvailable = true;
			} else if ( propName === 'wiggle' ) {
				sn.runtime.powerIOAreaParameters.value(propName, sn.env[propName]);
				sn.runtime.powerIOAreaChart.regenerate();
				return;
			}
			if ( getAvailable ) {
				sn.datum.availableDataRange(sourceSets(true), function(reportableInterval) {
					delete sn.runtime.sourceColorMap; // to regenerate
					setup(reportableInterval);
				});
			} else {
				powerIOAreaChartSetup(sn.runtime.reportableEndDate);
			}
		}).each(function(e) {
			var input = d3.select(this);
			var name = input.attr('name');
			if ( sn.env[name] !== undefined ) {
				if ( input.property('type') === 'checkbox' ) {
					input.attr('checked', (sn.env[name] === 'true' ? 'checked' : null));
				} else {
					input.property('value', sn.env[name]);
				}
			}
		});

	// toggle between supported aggregate levels
	d3.select('#range-toggle').classed('clickable', true).on('click', function(d, i) {
		var me = d3.select(this);
		me.classed('hit', true);
		var currAgg = sn.runtime.powerIOAreaChart.aggregate();
		sn.runtime.powerIOAreaParameters.aggregate = (currAgg === 'TenMinute' ? 'Hour' : currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'TenMinute');
		powerIOAreaChartSetup(sn.runtime.reportableEndDate);
		setTimeout(function() {
			me.classed('hit', false);
		}, 500);
		updateRangeSelection();
	});
	
	// toggle sum lines on/off
	d3.select('#sumline-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var off = me.classed('off');
		me.classed('off', !off);
		sn.runtime.powerIOAreaChart.showSumLine(off);
	});
	
}

function setupSourceGroupMap() {
	var map = {},
		sourceArray;
	sourceArray = sn.env.sourceIds.split(/\s*,\s*/);
	map['Generation'] = sourceArray;
	
	sourceArray = sn.env.consumptionSourceIds.split(/\s*,\s*/);
	map['Consumption'] = sourceArray;
	
	if ( sn.env.controlSourceIds ) {
		sourceArray = sn.env.controlSourceIds.split(/\s*,\s*/);
		map['Control'] = sourceArray;
	}
	
	sn.runtime.sourceGroupMap = map;
}

function sourceSets(regenerate) {
	if ( !sn.runtime.sourceGroupMap || regenerate ) {
		setupSourceGroupMap();
	}
	var result = [
		{ nodeUrlHelper : sn.runtime.urlHelper, sourceIds : sn.runtime.sourceGroupMap['Generation'] },
		{ nodeUrlHelper : sn.runtime.consumptionUrlHelper, sourceIds : sn.runtime.sourceGroupMap['Consumption'] }
	];
	if ( sn.runtime.sourceGroupMap['Control'] ) {
		result.push({ nodeUrlHelper : sn.runtime.controlUrlHelper, sourceIds : sn.runtime.sourceGroupMap['Control'] });
	}
	return result;
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 30,
		sourceIds : 'Power',
		consumptionNodeId : 108,
		consumptionSourceIds : 'A,B,C',
		controlNodeId : 0,
		controlSourceIds : '',
		minutePrecision : 10,
		numHours : 24,
		numDays : 7,
		numMonths : 4,
		numYears : 2,
		linkOld : 'false'
	});
	
	sn.runtime.wChartRefreshMs = sn.env.minutePrecision * 60 * 1000;

	sn.runtime.powerIOAreaParameters = new sn.Configuration({
		aggregate : 'Hour',
		excludeSources : sn.runtime.excludeSources,
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		wiggle : (sn.env.wiggle === 'true'),
		plotProperties : {TenMinute : 'watts', Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.powerIOAreaContainer = d3.select(d3.select('#power-area-chart').node().parentNode);
	sn.runtime.powerIOAreaChart = sn.chart.powerIOAreaChart('#power-area-chart', sn.runtime.powerIOAreaParameters)
		.dataCallback(chartDataCallback)
		.drawAnnotationsCallback(controlDrawCallback)
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback);
	
	sn.runtime.urlHelper = sn.datum.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.consumptionUrlHelper = sn.datum.nodeUrlHelper(sn.env.consumptionNodeId);
	sn.runtime.controlUrlHelper = sn.datum.nodeUrlHelper(sn.env.controlNodeId);

	setupUI();
	sn.datum.availableDataRange(sourceSets(), function(reportableInterval) {
		setup(reportableInterval);
		if ( sn.runtime.refreshTimer === undefined ) {
			// refresh chart data on interval
			sn.runtime.refreshTimer = setInterval(function() {
				sn.datum.availableDataRange(sourceSets(), function(repInterval) {
					var jsonEndDate = repInterval.eDate;
					if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
						setup(repInterval);
					}
				});
			}, sn.runtime.wChartRefreshMs);
		}
	});
}
