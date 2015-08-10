/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 * @require solarnetwork-d3-chart-energy-io 1.0.0
 */

sn.config.debug = true;
sn.config.host = 'data.solarnetwork.net';
sn.runtime.excludeSources = new sn.Configuration();

function regenerateChart() {
	if ( sn.runtime.energyBarIOChart === undefined ) {
		return;
	}
	sn.runtime.energyBarIOChart.regenerate();
	sn.adjustDisplayUnits(sn.runtime.energyBarIOContainer, 'Wh', sn.runtime.energyBarIOChart.yScale());
	sn.adjustDisplayUnits(sn.runtime.barTooltip, 'Wh', sn.runtime.energyBarIOChart.yScale());
}

// handle clicks on legend handler
function legendClickHandler(d, i) {
	sn.runtime.excludeSources.toggle(d.source);
	regenerateChart();
}

// show/hide the proper range selection based on the current aggregate level
function updateRangeSelection() {
	d3.selectAll('#details div.range').style('display', function() {
		return (d3.select(this).classed(sn.runtime.energyBarIOParameters.aggregate.toLowerCase()) ? 'block' : 'none');
	});
	d3.select('#hemisphere-toggle').transition().duration(sn.runtime.energyBarIOChart.transitionMs())
		.style('opacity', (sn.runtime.energyBarIOParameters.aggregate == 'Month' ? 1 : 0));
}

function chartDataCallback(dataType, datum) {
	// create date property
	if ( datum.localDate ) {
		datum.date = sn.dateTimeFormat.parse(datum.localDate +' ' +datum.localTime);
	} else if ( datum.created ) {
		datum.date = sn.timestampFormat.parse(datum.created);
	} else {
		datum.date = null;
	}
}

function colorForDataTypeSource(dataType, sourceId, sourceIndex) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.colorData[mappedSourceId];
}

function sourceExcludeCallback(dataType, sourceId) {
	var mappedSourceId = sn.runtime.sourceColorMap.displaySourceMap[dataType][sourceId];
	return sn.runtime.excludeSources.enabled(mappedSourceId);
}

// Watt stacked area overlap chart
function setupEnergyIOChart(container, chart, parameters, endDate, sourceSets) {
	var queryRange = sn.datum.loaderQueryRange(parameters.aggregate, sn.env, endDate);
	var plotPropName = parameters.plotProperties[parameters.aggregate];
	var loadSets = sourceSets.map(function(sourceSet) {
		return sn.datum.loader(sourceSet.sourceIds, sourceSet.nodeUrlHelper, queryRange.start, queryRange.end, parameters.aggregate);
	});
	
	container.selectAll('.time-count').text(queryRange.timeCount);
	container.selectAll('.time-unit').text(queryRange.timeUnit);
	
	sn.datum.multiLoader(loadSets).callback(function(error, results) {
		if ( !(Array.isArray(results) && results.length === 2) ) {
			sn.log("Unable to load data for Energy Bar chart: {0}", error);
			return;
		}
		// note the order we call load dictates the layer order of the chart... each call starts a new layer on top of previous layers
		chart.reset();
		sourceSets.forEach(function(sourceSet, idx) {
			chart.load(results[idx], sourceSet.dataType);
		});
		regenerateChart();
		sn.log("Energy Bar chart watt range: {0}", chart.yDomain());
		sn.log("Energy Bar chart time range: {0}", chart.xDomain());
	}).load();
}

function energyBarIOChartSetup(endDate) {
	setupEnergyIOChart(
		sn.runtime.energyBarIOContainer,
		sn.runtime.energyBarIOChart,
		sn.runtime.energyBarIOParameters,
		endDate,
		sn.runtime.sourceSets);
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
			{ nodeUrlHelper : sn.runtime.urlHelper, 
				sourceIds : sn.runtime.sourceGroupMap['Generation'], 
				dataType : 'Generation' },
			{ nodeUrlHelper : sn.runtime.consumptionUrlHelper, 
				sourceIds : sn.runtime.sourceGroupMap['Consumption'], 
				dataType : 'Consumption' }
		];
	}
	return sn.runtime.sourceSets;
}

/**
 * Generate an array of source color mappings ordered to match the display order in the chart.
 * 
 * @param {Object} sourceGroupMap - A mapping of data types to associated sources, e.g. { Generation : [A, B, C] },
 *                                  that is passed to {@link sn.sourceColorMapping}.
 * @param {Object} sourceColorMap - An object returned from {@link sn.sourceColorMapping}, e.g.
 *                                  { 
 *                                     displaySourceMap : { Generation : { A : 'Generation / A' } },
 *                                     colorMap : { 'Generation / A' : '#000' }
 *                                  }
 */
function sourceLabelsColorMap(sourceGroupMap, sourceColorMap) {
	var result = []; // { source : X, color: Y }
	['Generation', 'Consumption'].forEach(function(dataType) {
		var dataTypeSources = sourceGroupMap[dataType];
		if ( dataType === 'Generation' ) {
			// reverse the order, to match the chart
			dataTypeSources = dataTypeSources.slice().reverse();
		}
		dataTypeSources.forEach(function(source) {
			var displaySource = sourceColorMap.displaySourceMap[dataType][source];
			result.push({ dataType: dataType, source : displaySource, color: sourceColorMap.colorMap[displaySource]});
		});
	});
	return result;
}

function setupBarTooltip(sourceGroupMap) {
	d3.select('#source-labels-tooltip').html(null);
	sn.colorDataLegendTable('#source-labels-tooltip', sn.runtime.labelColorMap, undefined, function(s) {
		s.html(function(d) {
			var sourceGroup = sn.runtime.sourceColorMap.displaySourceObjects[d];
			sn.log('Got data type {0} source {1}', sourceGroup.dataType, sourceGroup.source);
			return '<span class="energy">0</span> <span class="unit">(kWh)</span>';
		});
	});
	var tbody = d3.select('#source-labels-tooltip tbody');
	var rows = tbody.selectAll('tr');
	var index = 0;
	var dataTypes = ['Generation', 'Consumption'];
	dataTypes.forEach(function(dataType) {
		var dataTypeSources = sourceGroupMap[dataType];
		var row, cell;
		index += dataTypeSources.length;
		// insert a sub-total row
		if ( index >= rows[0].length ) {
			row = tbody.append('tr');
		} else {
			row = tbody.insert('tr', function() { 
				return rows[0][index];
			});
		}
		row.classed('subtotal', true);
		cell = row.append('td').attr('colspan', '2');
		if ( dataTypeSources.length > 1 ) {
			cell.html('<span class="energy">0</span> <span class="unit">(kWh)</span>');
		}
	});
	
	// add grand total row
	tbody.append('tr').classed('total', true).html('<td colspan="2"><span class="label">Net:</span> <span class="energy">0</span> <span class="unit">(kWh)</span></td>');
}

function setup(repInterval) {
	sn.runtime.reportableEndDate = repInterval.eDate;
	if ( sn.runtime.sourceColorMap === undefined ) {
		sn.runtime.sourceColorMap = sn.sourceColorMapping(sn.runtime.sourceGroupMap);
	
		// we make use of sn.colorFn, so stash the required color map where expected
		sn.runtime.colorData = sn.runtime.sourceColorMap.colorMap;

		sn.runtime.groupColorMap = {
			'Generation' : sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Generation'][sn.runtime.sourceGroupMap['Generation'][0]]],
			'Consumption' : sn.runtime.sourceColorMap.colorMap[sn.runtime.sourceColorMap.displaySourceMap['Consumption'][sn.runtime.sourceGroupMap['Consumption'][0]]]
		};

		// set up form-based details
		d3.select('#details .consumption').style('color', sn.runtime.groupColorMap['Consumption']);
		d3.select('#details .generation').style('color', sn.runtime.groupColorMap['Generation']);

		// create copy of color data for reverse ordering so labels vertically match chart layers
		sn.runtime.labelColorMap = sourceLabelsColorMap(sn.runtime.sourceGroupMap, sn.runtime.sourceColorMap);
		
		// create clickable legend table
		sn.colorDataLegendTable('#source-labels', sn.runtime.labelColorMap, legendClickHandler, function(s) {
			if ( sn.env.linkOld === 'true' ) {
				s.html(function(d) {
					return '<a href="' +sn.runtime.urlHelper.nodeDashboard(d) +'">' +d +'</a>';
				});
			} else {
				s.text(Object);
			}
		});
		
		// create tooltip legend table
		setupBarTooltip(sn.runtime.sourceGroupMap);
	}

	updateRangeSelection();
	
	energyBarIOChartSetup(sn.runtime.reportableEndDate);
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
			} else if ( propName === 'sourceIds'|| propName === 'consumptionSourceIds' ) {
				getAvailable = true;
			} else if ( propName === 'scale' ) {
				sn.runtime.energyBarIOChart.scaleFactor('Generation', Number(sn.env[propName]));
				regenerateChart(sn.runtime.energyBarIOChart);
				return;
			} else if ( propName === 'consumptionScale' ) {
				sn.runtime.energyBarIOChart.scaleFactor('Consumption', Number(sn.env[propName]));
				regenerateChart(sn.runtime.energyBarIOChart);
				return;
			}
			if ( getAvailable ) {
				sn.datum.availableDataRange(sourceSets(true), function(reportableInterval) {
					delete sn.runtime.sourceColorMap; // to regenerate
					setup(reportableInterval);
				});
			} else {
				energyBarIOChartSetup(sn.runtime.reportableEndDate);
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
		var currAgg = sn.runtime.energyBarIOChart.aggregate();
		sn.runtime.energyBarIOParameters.aggregate = (currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'Hour');
		energyBarIOChartSetup(sn.runtime.reportableEndDate);
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
		sn.runtime.energyBarIOChart.showSumLine(off);
	});
	
	// toggle hemispheres
	d3.select('#hemisphere-toggle').classed('clickable', true).on('click', function(d) {
		var me = d3.select(this);
		var south = me.classed('south');
		me.classed('south', !south);
		sn.runtime.energyBarIOChart.northernHemisphere(south);
	});
}

function handleHoverEnter() {
	sn.runtime.barTooltip.style('display', null);
}

function handleHoverLeave() {
	sn.runtime.barTooltip.style('display', 'none');
}

function handleHoverMove(svgContainer, point, data) {
	var chart = this,
		dataTypes = ['Generation', 'Consumption'],
		tooltip = sn.runtime.barTooltip,
		tooltipRect = tooltip.node().getBoundingClientRect(),
		matrix = svgContainer.getScreenCTM().translate(data.x, 0);
	
	var subTotalDataTypes = dataTypes.filter(function(dataType) { 
		var dataTypeSources = sn.runtime.sourceGroupMap[dataType];
		return (dataTypeSources.length > 1);
	});
	
	var lastGroupDataType, groupCount = 0, netTotal = 0;

	tooltip.style('left', Math.round(window.pageXOffset + matrix.e - tooltipRect.width / 2) + 'px')
            .style('top', Math.round(window.pageYOffset + matrix.f - tooltipRect.height) + 'px')
            .style('display', null);
    tooltip.select('h3').text(sn.dateTimeFormat(data.date));
    tooltip.selectAll('td.desc span.energy').data(sn.runtime.labelColorMap).text(function(d, i) {
    	var index = i, sourceMap,
    		groupData = data.groups[d.dataType];
		if ( groupData.groupId !== lastGroupDataType ) {
			groupCount = i;
			lastGroupDataType = groupData.groupId;
		}
		index -= groupCount;
		if ( groupData.negate ) {
			netTotal -= groupData.data[index];
		} else {
			netTotal += groupData.data[index];
		}
    	return sn.runtime.barTooltipFormat(groupData.data[index] / chart.yScale());
    });
    
    // fill in subtotals
    tooltip.selectAll('tr.subtotal span.energy').data(subTotalDataTypes).text(function(dataType) {
    	var groupData = data.groups[dataType].data,
    		sum = d3.sum(groupData);
    	return sn.runtime.barTooltipFormat(sum / chart.yScale());
    });
    
    // fill in net total
    tooltip.select('tr.total')
    		.style('color', sn.runtime.groupColorMap[netTotal < 0 ? 'Consumption' : 'Generation'])
    .select('span.energy')
    	.text(sn.runtime.barTooltipFormat(netTotal / chart.yScale()));
    	
}

function handleDoubleClick(svgContainer, point, data) {
	var chart = this,
		currAgg = chart.aggregate();
	console.log('Got dblclick @ %s for bar %s', point, data.date);
	sn.runtime.energyBarIOParameters.aggregate = (currAgg === 'Hour' ? 'Day' : currAgg === 'Day' ? 'Month' : 'Hour');
	energyBarIOChartSetup(sn.runtime.reportableEndDate);
	updateRangeSelection();
}

function onDocumentReady() {
	sn.setDefaultEnv({
		nodeId : 30,
		sourceIds : 'Main',
		scale : 1,
		consumptionNodeId : 108,
		consumptionSourceIds : 'A,B,C',
		consumptionScale : 1,
		numDays : 7,
		numMonths : 4,
		numYears : 2,
		northernHemisphere : 'false'
	});
	sn.runtime.wChartRefreshMs = 30 * 60 * 1000;
	
	sn.runtime.energyBarIOParameters = new sn.Configuration({
		aggregate : 'Hour',
		northernHemisphere : (sn.env.northernHemisphere === 'true' ? true : false),
		plotProperties : {Hour : 'wattHours', Day : 'wattHours', Month : 'wattHours'}
	});
	sn.runtime.energyBarIOContainer = d3.select(d3.select('#energy-io-chart').node().parentNode);
	sn.runtime.energyBarIOChart = sn.chart.energyIOBarChart('#energy-io-chart', sn.runtime.energyBarIOParameters)
		.scaleFactor({ 'Generation' : sn.env.scale, 'Consumption' : sn.env.consumptionScale })
		.dataCallback(chartDataCallback)
		.colorCallback(colorForDataTypeSource)
		.sourceExcludeCallback(sourceExcludeCallback)
		.hoverEnterCallback(handleHoverEnter)
		.hoverMoveCallback(handleHoverMove)
		.hoverLeaveCallback(handleHoverLeave)
		.doubleClickCallback(handleDoubleClick);
	
	sn.runtime.urlHelper = sn.datum.nodeUrlHelper(sn.env.nodeId);
	sn.runtime.consumptionUrlHelper = sn.datum.nodeUrlHelper(sn.env.consumptionNodeId);

	sn.runtime.barTooltip = d3.select('#bar-chart-tooltip');
	sn.runtime.barTooltipFormat = d3.format(',.1f');

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
