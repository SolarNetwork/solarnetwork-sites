/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.0.3
 */

if ( sn === undefined ) {
	sn = { chart: {} };
} else if ( sn.chart === undefined ) {
	sn.chart = {};
}

/**
 * @typedef sn.chart.energyIOPieChartParameters
 * @type {sn.Configuration}
 * @property {number} [width=812] - desired width, in pixels, of the chart
 * @property {number} [height=300] - desired height, in pixels, of the chart
 * @property {number[]} [padding=[10, 0, 20, 30]] - padding to inset the chart by, in top, right, bottom, left order
 * @property {number} [transitionMs=600] - transition time
 * @property {sn.Configuration} excludeSources - the sources to exclude from the chart
 */

/**
 * An power input and output chart designed to show consumption and generation data as an overall
 * percentage.
 * 
 * You can use the {@code excludeSources} parameter to dynamically alter which sources are visible
 * in the chart. After changing the configuration call {@link sn.chart.energyIOPieChart#regenerate()}
 * to re-draw the chart.
 * 
 * Note that the global {@link sn.colorFn} function is used to map sources to colors, so that
 * must be set up previously.
 * 
 * @class
 * @param {string} containerSelector - the selector for the element to insert the chart into
 * @param {sn.chart.energyIOPieChartParameters} [chartConfig] - the chart parameters
 * @returns {sn.chart.energyIOPieChart}
 */
sn.chart.energyIOPieChart = function(containerSelector, chartConfig) {
	var that = {
		version : "1.0.0"
	};
	var sources = [];
	var config = (chartConfig || new sn.Configuration());
	
	// default to container's width, if we can
	var containerWidth = sn.pixelWidth(containerSelector);
	
	var p = (config.padding || [10, 0, 20, 30]),
		w = (config.width || containerWidth || 300) - p[1] - p[3],
		h = (config.height || 300) - p[0] - p[2],
		r = d3.min([w, h]) / 2;

	var transitionMs = undefined;
	
	var svgRoot = undefined,
		svg = undefined;
	
	var arc = d3.svg.arc()
			.innerRadius(0)
			.outerRadius(r);

	var originalData = undefined;
	var pieSlices = undefined;
	var consumptionLayerCount = 0;
	
	function parseConfiguration() {
		transitionMs = (config.transitionMs || 600);
	}

	parseConfiguration();

	svgRoot = d3.select(containerSelector).select('svg');
	if ( svgRoot.empty() ) {
		svgRoot = d3.select(containerSelector).append('svg:svg')
			.attr('class', 'chart')
			.attr("width", w + p[1] + p[3])
			.attr("height", h + p[0] + p[2]);
	} else {
		svgRoot.selectAll('*').remove();
	}

	svg = svgRoot.append("g")
		.attr('class', 'data')
		.attr("transform", "translate(" + ((w + p[1] + p[3]) / 2) + "," + ((h + p[0] + p[2]) / 2) + ")");
	
	function strokeColorFn(d, i) { return d3.rgb(sn.colorFn(d,i)).darker(); }

	// setup display units in kW if domain range > 1000
	var displayFactor = 1;
	var displayFormatter = d3.format(',d');
	function computeUnits() {
		var fmt;
		var maxValue = d3.max(pieSlices, function(d) {
			return d.value;
		});
		if ( maxValue >= 100000 ) {
			displayFactor = 1000000;
			fmt = ',g';
		} else if ( maxValue >= 1000 ) {
			displayFactor = 1000;
			fmt = ',g';
		} else {
			displayFactor = 1;
			fmt = ',d';
		}
		displayFormatter = d3.format(fmt);
	}
	
	function displayFormat(d) {
		return displayFormatter(d / displayFactor);
	}
	
	function setup(rawData) {
		originalData = rawData;
		
		var rollup = d3.nest()
			.key(function(d) { return d.sourceId; })
			.rollup(function(group) { 
				return d3.sum(group, function(d) {
					return (config.excludeSources !== undefined && config.excludeSources.enabled(d.sourceId) 
							? 0 : d.wattHours);
				}); 
			})
			.entries(rawData);
		
		var pie = d3.layout.pie()
			.value(function(d) {
				return d.values;
			});
		
		pieSlices = pie(rollup);
		
		computeUnits();
	}
	
	function pieSliceColorFn(d) {
		return sn.colorFn({source:d.data.key});
	}

	function redraw() {	
		// draw data areas
		var pie = svg.selectAll("path").data(pieSlices);
		
		pie.transition().duration(transitionMs).delay(200)
				.attr("d", arc)
				.style("fill", pieSliceColorFn);
		
		pie.enter().append("path")
				.attr("class", "area")
				.style("fill", pieSliceColorFn)
				.attr("d", arc);
		
		pie.exit().remove();
	}

	that.sources = sources;
	
	/**
	 * Get the scaling factor the labels are using. By default this will return {@code 1}.
	 * After calling the {@link #load()} method, however, the chart may decide to scale
	 * the data for clarity. You can call this method to find out the scaling factor the
	 * chart ended up using.
	 *  
	 * @return the y-axis scale factor
	 * @memberOf sn.chart.energyIOPieChart
	 */
	that.scale = function() { return displayFactor; };

	/**
	 * Get the sum total of all slices in the pie chart.
	 *  
	 * @return the sum total energy value, in watt hours
	 * @memberOf sn.chart.energyIOPieChart
	 */
	that.totalValue = function() {
		return d3.sum(pieSlices, function(d) {
			return d.value;
		});
	};
	
	/**
	 * Load data for the chart.
	 * 
	 * @return this object
	 * @memberOf sn.chart.energyIOPieChart
	 */
	that.load = function(rawData) {
		parseConfiguration();
		setup(rawData);
		redraw();
		return that;
	};
	
	/**
	 * Regenerate the chart, using the current data. This can be called after disabling a
	 * source, for example.
	 * 
	 * @return this object
	 * @memberOf sn.chart.energyIOPieChart
	 */
	that.regenerate = function() {
		if ( originalData === undefined ) {
			// did you call load() first?
			return that;
		}
		load(originalData);
		return that;
	};
	
	/**
	 * Get or set the consumption source count. Set this to the number of sources that 
	 * are considered "consumption" and should show up <em>under</em> the y-axis origin.
	 * The sources are assumed to already be ordered with consumption before generation.
	 * 
	 * @param {number} [value] the number of consumption sources to use
	 * @return when used as a getter, the count number, otherwise this object
	 * @memberOf sn.chart.energyIOPieChart
	 */
	that.consumptionSourceCount = function(value) {
		if ( !arguments.length ) return consumptionLayerCount;
		consumptionLayerCount = +value; // the + used to make sure we have a Number
		return that;
	};
	
	/**
	 * Get or set the animation transition time, in milliseconds.
	 * 
	 * @param {number} [value] the number of milliseconds to use
	 * @return when used as a getter, the millisecond value, otherwise this object
	 * @memberOf sn.chart.energyIOPieChart
	 */
	that.transitionMs = function(value) {
		if ( !arguments.length ) return transitionMs;
		transitionMs = +value; // the + used to make sure we have a Number
		return that;
	};

	return that;
};
