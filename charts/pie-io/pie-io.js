/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-pie-io 1.0.0
 */
'use strict';

sn.config.debug = true;
sn.runtime.excludeSources = new sn.Configuration();

function regenerateChart() {
	var chart = sn.runtime.energyPieChart,
		container = sn.runtime.energyPieContainer;
	if ( chart === undefined ) {
		return;
	}
	chart.regenerate();
	sn.ui.adjustDisplayUnits(container, 'Wh', chart.scale(), 'energy');
	sn.ui.adjustDisplayUnits(sn.runtime.pieTooltip, 'Wh', chart.scale());
}

//handle clicks on legend handler
function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	regenerateChart();
}

function sourceExcludeCallback(dataType, sourceId) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.excludeSources.enabled(mappedSourceId);
}

function colorForDataTypeSource(dataType, sourceId) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.colorData[mappedSourceId];
}


function energyPieChartSetup(endDate, chart, parameters) {
	var end,
		start,
		timeCount,
		timeUnit,
		sourceMap = sn.runtime.sourceGroupMap,
		queryRange;
	
	// for aggregate time ranges, the 'end' date in inclusive
	if ( parameters.aggregate === 'Month' ) {
		timeCount = (sn.env.numYears || 1);
		timeUnit = 'year';
		end = d3.time.month.utc.floor(endDate);
		start = d3.time.year.utc.offset(end, -timeCount);
	} else if ( parameters.aggregate === 'Day' ) {
		timeCount = (sn.env.numMonths || 3);
		timeUnit = 'month';
		end = d3.time.day.utc.floor(endDate);
		start = d3.time.month.utc.offset(end, -timeCount);
	} else {
		// assume Hour
		timeCount = (sn.env.numDays || 7);
		timeUnit = 'day';
		end = d3.time.hour.utc.floor(endDate);
		start = d3.time.day.utc.offset(end, -timeCount);
	}

	queryRange = sn.api.datum.loaderQueryRange(parameters.aggregate, sn.env, endDate);
	
	d3.select('.watthour-chart .time-count').text(queryRange.timeCount);
	d3.select('.watthour-chart .time-unit').text(queryRange.timeUnit);
	
	sn.api.datum.multiLoader([
		sn.api.datum.loader(sourceMap['Consumption'], sn.runtime.consumptionUrlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate),
		sn.api.datum.loader(sourceMap['Generation'], sn.runtime.urlHelper, 
			queryRange.start, queryRange.end, parameters.aggregate)
	]).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === 2) ) {
			sn.log("Unable to load data for Power Area chart: {0}", error);
			return;
		}
		chart.reset()
			.load(results[0], 'Consumption')
			.load(results[1], 'Generation');
		regenerateChart();
		sn.log("Energy Pie IO chart Wh total: {0}", chart.totalValue());
		sn.log("Energy Pie IO chart time range: {0}", [start, end]);
	}).load();
}

function setupSourceGroupMap() {
	var map = {},
		sourceArray;
	sourceArray = sn.env.sourceIds.split(/\s*,\s*/);
	map['Generation'] = sourceArray;
	
	sourceArray = sn.env.consumptionSourceIds.split(/\s*,\s*/);
	map['Consumption'] = sourceArray;
	
	sn.runtime.sourceGroupMap = map;
}

function sourceSets(regenerate) {
	if ( !sn.runtime.sourceGroupMap || !sn.runtime.sourceSets || regenerate ) {
		setupSourceGroupMap();
		sn.runtime.sourceSets = [
			{ nodeUrlHelper : sn.runtime.consumptionUrlHelper, 
				sourceIds : sn.runtime.sourceGroupMap['Consumption'], 
				dataType : 'Consumption' },
			{ nodeUrlHelper : sn.runtime.urlHelper, 
				sourceIds : sn.runtime.sourceGroupMap['Generation'], 
				dataType : 'Generation' }
		];
	}
	return sn.runtime.sourceSets;
}

function setup(repInterval) {
	sn.runtime.reportableEndDate = repInterval.eDate;
	if ( sn.runtime.sourceColorMap === undefined ) {
		sn.runtime.sourceColorMap = sn.color.sourceColorMapping(sn.runtime.sourceGroupMap);
	
		// we make use of sn.colorFn, so stash the required color map where expected
		sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

		sn.runtime.groupColorMap = {
			'Generation' : sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Generation'][sn.runtime.sourceGroupMap['Generation'][0]]],
			'Consumption' : sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Consumption'][sn.runtime.sourceGroupMap['Consumption'][0]]]
		};

		// set up form-based details
		d3.select('#details .consumption').style('color', sn.runtime.groupColorMap['Consumption']);
		d3.select('#details .generation').style('color', sn.runtime.groupColorMap['Generation']);

        sn.ui.colorDataLegendTable('#source-labels', sn.runtime.sourceColorMap.colorMap, legendClickHandler, function(s) {
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

	energyPieChartSetup(sn.runtime.reportableEndDate, sn.runtime.energyPieChart, sn.runtime.energyPieParameters);
}

function handleHoverEnter() {
	sn.runtime.pieTooltip.style('display', null);
}

function handleHoverLeave() {
	sn.runtime.pieTooltip.style('display', 'none');
}

function handleHoverMove(path, point, data) {
	var chart = this,
		tooltip = sn.runtime.pieTooltip,
		tooltipRect = tooltip.node().getBoundingClientRect(),
		matrix = data.centerContainer.getScreenCTM().translate(data.center[0] + data.labelTranslate[0], data.center[1] + data.labelTranslate[1]),
		sourceColorMap = sn.runtime.sourceColorMap,
		sourceDisplay = sourceColorMap.displaySourceMap[data.groupId][data.sourceId],
		color = sourceColorMap.colorMap[sourceDisplay],
		descCell = tooltip.select('td.desc'),
		netCell = tooltip.select('tr.total td'),
		adjustL = 0,
		adjustT = 0,
		degrees = data.degrees;
		
	// adjust for left/right/top/bottom of circle
	if ( degrees > 270 ) {
		// top left
		adjustT = -tooltipRect.height;
		adjustL = -tooltipRect.width;
	} else if ( degrees > 180 ) {
		// bottom left
		adjustL = -tooltipRect.width;
	} else if ( degrees > 90 ) {
		// bottom right
		// nothing to adjust here
	} else {
		// top right
		adjustT = -tooltipRect.height;
	}
	
	// calculate net
	var netTotal = data.allData.reduce(function(prev, curr) {
		var v = curr.sum;
		if ( curr.groupId === 'Consumption' ) {
			v *= -1;
		}
		return prev + v;
	}, 0);
	
	tooltip.style('left', Math.round(window.pageXOffset + matrix.e + adjustL ) + 'px')
    	.style('top', Math.round(window.pageYOffset + matrix.f + adjustT) + 'px');
            
    tooltip.select('h3').text(sourceDisplay);
    tooltip.select('.swatch').style('background-color', color);
    descCell.select('.percent').text(data.percentDisplay);
    descCell.select('.energy').text(data.valueDisplay);
    tooltip.select('tr.total').style('color', sn.runtime.groupColorMap[netTotal < 0 ? 'Consumption' : 'Generation'])
	netCell.select('.energy').text(sn.runtime.pieTooltipFormat(netTotal / chart.scale()));
}

function urlHelperForAvailbleDataRange(e, i) {
	if ( !arguments.length ) return sn.runtime.urlHelper;
	return (i === 0 ? sn.runtime.consumptionUrlHelper : sn.runtime.urlHelper);
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
				sn.runtime.consumptionUrlHelper = sn.api.node.nodeUrlHelper(sn.env[propName]);
				getAvailable = true;
			} else if ( propName === 'nodeId' ) {
				sn.runtime.urlHelper = sn.api.node.nodeUrlHelper(sn.env[propName]);
				getAvailable = true;
			} else if ( propName === 'sourceIds'|| propName === 'consumptionSourceIds' ) {
				getAvailable = true;
			} else if ( propName === 'scale' ) {
				sn.runtime.energyPieChart.scaleFactor('Generation', Number(sn.env[propName]));
				regenerateChart();
				return;
			} else if ( propName === 'consumptionScale' ) {
				sn.runtime.energyPieChart.scaleFactor('Consumption', Number(sn.env[propName]));
				regenerateChart();
				return;
			}
			if ( getAvailable ) {
				sn.api.node.availableDataRange(sourceSets(true), function(reportableInterval) {
					delete sn.runtime.sourceColorMap; // to regenerate
					setup(reportableInterval);
				});
			} else {
				energyPieChartSetup(sn.runtime.reportableEndDate, sn.runtime.energyPieChart, sn.runtime.energyPieParameters);
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
		var currAgg = sn.runtime.energyPieParameters.aggregate;
		sn.runtime.energyPieParameters.aggregate = (currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'Hour');
		energyPieChartSetup(sn.runtime.reportableEndDate, sn.runtime.energyPieChart, sn.runtime.energyPieParameters);
		setTimeout(function() {
			me.classed('hit', false);
		}, 500);
		updateRangeSelection();
	});

	// toggle percentages on/off
	d3.select('#label-percent-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var off = me.classed('off');
		me.classed('off', !off);
		sn.runtime.energyPieParameters.toggle('hidePercentages', !off);
		sn.runtime.energyPieChart.regenerate();
	});
	
	// toggle labels on/off
	d3.select('#label-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var off = me.classed('off');
		me.classed('off', !off);
		sn.runtime.energyPieParameters.toggle('hideValues', !off);
		sn.runtime.energyPieChart.regenerate();
	});
	
	// toggle pie/donut modes
	d3.select('#donut-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var isPie = me.classed('fa-circle-o');
		me.classed({
			'fa-circle-o' : !isPie,
			'fa-circle' : isPie
		});
		sn.runtime.energyPieParameters.value('innerRadius', (isPie ? 60 : 0));
		sn.runtime.energyPieChart.regenerate();
	});
	
}

//show/hide the proper range selection based on the current aggregate level
function updateRangeSelection() {
	d3.selectAll('#details div.range').style('display', function() {
		return (d3.select(this).classed(sn.runtime.energyPieParameters.aggregate.toLowerCase()) ? 'block' : 'none');
	});
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 108,
		sourceIds : 'Main',
		scale : 1,
		consumptionNodeId : 108,
		consumptionSourceIds : 'A,B,C',
		consumptionScale : 1,
		minutePrecision : 10,
		numDays : 7,
		numMonths : 3,
		numYears : 1,
		linkOld : 'false'
	});
	
	sn.runtime.wChartRefreshMs = 30 * 60 * 1000;

	sn.runtime.energyPieParameters = new sn.Configuration({
		aggregate : 'Hour',
		excludeSources : sn.runtime.excludeSources
	});
	sn.runtime.energyPieContainer = d3.select(d3.select('#pie-io-chart').node().parentNode);
	sn.runtime.energyPieChart = sn.chart.energyIOPieChart('#pie-io-chart', sn.runtime.energyPieParameters)
		.scaleFactor({ 'Generation' : sn.env.scale, 'Consumption' : sn.env.consumptionScale })
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback)
		.hoverEnterCallback(handleHoverEnter)
		.hoverMoveCallback(handleHoverMove)
		.hoverLeaveCallback(handleHoverLeave);

	sn.runtime.pieTooltip = d3.select('#pie-chart-tooltip');
	sn.runtime.pieTooltipFormat = d3.format(',.1f');

	sn.runtime.urlHelper = sn.api.node.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.consumptionUrlHelper = sn.api.node.nodeUrlHelper(sn.env.consumptionNodeId);
	
	setupUI();
	sn.api.node.availableDataRange(sourceSets(), function(reportableInterval) {
		setup(reportableInterval);
		if ( sn.runtime.refreshTimer === undefined ) {
			// refresh chart data on interval
			sn.runtime.refreshTimer = setInterval(function() {
				sn.api.node.availableDataRange(sourceSets(), function(repInterval) {
					var jsonEndDate = repInterval.eDate;
					if ( jsonEndDate.getTime() > sn.runtime.reportableEndDate.getTime() ) {
						setup(repInterval);
					}
				});
			}, sn.runtime.wChartRefreshMs);
		}
	});
}
