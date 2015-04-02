/**
 * @require d3 3.0
 * @require solarnetwork-d3 0.0.4
 * @require solarnetwork-d3-chart-base 1.0.0
 */
(function() {
'use strict';

if ( sn.chart === undefined ) {
	sn.chart = {};
}

/**
 * @typedef sn.chart.powerAreaChartParameters
 * @type {sn.Configuration}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[10, 0, 20, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
 * @property {object} [plotProperties] - the property to plot for specific aggregation levels; if unspecified 
 *                                       the {@code watts} property is used
 * @property {sn.Configuration} excludeSources - the sources to exclude from the chart
 */

/**
 * An power stacked area chart.
 * 
 * @class
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.powerAreaChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.powerAreaChart}
 */
sn.chart.powerAreaChart = function(containerSelector, chartConfig) {
	var parent = sn.chart.baseGroupedStackChart(containerSelector, chartConfig),
		superDraw = sn.superMethod.call(parent, 'draw');
	var self = (function() {
		var	me = sn.util.copy(parent);
		return me;
	}());
	parent.me = self;

	var areaPathGenerator = d3.svg.area()
		.interpolate('monotone')
		.x(function(d) { 
			return parent.x(d.date);
		})
		.y0(function(d) { 
			return parent.y(d.y0);
		})
		.y1(function(d) { 
			return parent.y(d.y0 + d.y);
		});

	function areaFillFn(d, i, j) {
		return parent.fillColor.call(this, d[0][parent.internalPropName].groupId, d[0], i);
	}
	
	function setup() {
		var allData = [],
			layerData,
			dummy,
			rangeX,
			rangeY,
			layers,
			plotPropName = parent.plotPropertyName;
		var stack = d3.layout.stack()
			.offset(self.stackOffset())
			.values(function(d) { 
				return d.values;
			})
			.x(function(d) { 
				return d.date; 
			})
			.y(function(d) { 
				var y = d[plotPropName];
				if ( y === undefined || y < 0 || y === null ) {
					y = 0;
				}
				return y;
			});
		parent.groupIds.forEach(function(groupId) {
			var rawGroupData = self.data(groupId),
				i,
				len,
				d;
			if ( !rawGroupData || !rawGroupData.length > 1 ) {
				return;
			}
			
			for ( i = 0, len = rawGroupData.length; i < len; i += 1 ) {
				d = rawGroupData[i];
				if ( !d.hasOwnProperty(parent.internalPropName) ) {
					d[parent.internalPropName] = {};
					d[parent.internalPropName].groupId = groupId;
					if ( self.dataCallback() ) {
						self.dataCallback().call(parent.me, groupId, d);
					} else if ( d.date === undefined ) {
						// automatically create Date
						d.date = sn.datum.datumDate(d);
					}
				}
				// remove excluded sources...
				if ( self.sourceExcludeCallback() && self.sourceExcludeCallback().call(parent.me, groupId, d.sourceId) ) {
					continue;
				}
				allData.push(d);
			}
		});

		layerData = d3.nest()
			.key(function(d) {
				// note we assume groupId has no pipe character in it
				return d[parent.internalPropName].groupId +'|' +d.sourceId;
			})
			.sortKeys(d3.ascending)
			.entries(allData);
		
		if ( layerData.length < 1 ) {
			return;
		}
		
		// fill in "holes" for each stack layer, if more than one layer. we assume data already sorted by date
		dummy = {};
		dummy[plotPropName] = null;
		sn.nestedStackDataNormalizeByDate(layerData, dummy, function(dummy, key) {
			var idx = key.indexOf('|');
			dummy[parent.internalPropName] = { groupId : key.slice(0, idx) };
			dummy.sourceId = key.slice(idx + 1);
		});
		
		if ( parent.me.layerPostProcessCallback() ) {
			// we have to perform this call once per group, so we split this into multiple calls
			layerData = (function() {
				var newLayerData = [];
				parent.groupIds.forEach(function(groupId) {
					var layerDataForGroup = layerData.filter(function(e) {
						return (e.key.indexOf(groupId+'|') === 0);
					});
					if ( layerDataForGroup.length > 0 ) {
						newLayerData = newLayerData.concat(parent.me.layerPostProcessCallback().call(
							parent.me, groupId, layerDataForGroup));
					}
				});
				return newLayerData;
			}());
		}
		
		rangeX = (allData.length > 0 ? [allData[0].date, allData[allData.length - 1].date] : undefined);
		layers = stack(layerData);
		parent.groupLayers['All'] = layers;
		rangeY = [0, d3.max(layers[layers.length - 1].values, function(d) { return d.y0 + d.y; })];
		
		// setup X domain
		if ( rangeX !== undefined ) {
			parent.x.domain(rangeX);
		}
		
		// setup Y domain
		if ( rangeY !== undefined ) {
			parent.y.domain(rangeY).nice();
		}
		
		parent.computeUnitsY();
	}
	
	function draw() {
		var transitionMs = parent.transitionMs();
		var layerData = parent.groupLayers['All'];
		var data = (layerData ? layerData.map(function(e) { return e.values; }) : []);
		
		var area = parent.svgDataRoot.selectAll('path.area').data(data, function(d) {
			return (d.length ? d[0][parent.internalPropName].groupId + '-' + d[0].sourceId : null);
		});
		
		area.transition().duration(transitionMs)
			.attr('d', areaPathGenerator)
			.style('fill', areaFillFn);

		area.enter().append('path')
				.attr('class', 'area')
				.style('fill', areaFillFn)
				.attr('d', areaPathGenerator)
				.style('opacity', 1e-6)
			.transition().duration(transitionMs)
				.style('opacity', 1);
		
		area.exit().transition().duration(transitionMs)
			.style('opacity', 1e-6)
			.remove();
			
		superDraw();
	};
	
	// override our setup funciton
	parent.setup = setup;
	
	// define our drawing function
	parent.draw = draw;
	
	return self;
};

}());
