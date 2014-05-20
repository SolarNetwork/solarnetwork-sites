if ( sn === undefined ) {
	sn = { ui: {} };
} else if ( sn.ui === undefined ) {
	sn.ui = {};
}

sn.ui.flipCounter = function(container, configuration) {
	var that = {
		version : "1.0.0"
	};
	var config = {
		flipperWidth				: 34,
		transitionMs				: 200,
		format						: d3.format('07,g'),
		animate						: true,
	};
	
	var root = undefined;
	var characters = ['0'];
	
	function configure(configuration) {
		var prop = undefined;
		for ( prop in configuration ) {
			config[prop] = configuration[prop];
		}
		
	}
	that.configure = configure;
	
	function render(startingValue) {
		root = d3.select(container).classed('flipCounter', true);
		update(startingValue === undefined ? 0 : startingValue);
	}
	that.render = render;
	
	function flipperOffset(d, i) { 
		return ((config.flipperWidth * (characters.length - 1)) - config.flipperWidth * i)+'px';
	}
	
	function update(newValue) {
		var str = config.format(newValue);
		var oldCharacters = characters;
		characters = (function() {
			var result = [];
			var i, len;
			for ( i = 0, len = str.length; i < len; i++ ) {
				result.push(str.charAt(i));
			}
			// we process in reverse, so changed elements are updated in left-to-right order
			return result.reverse();
		})();
		var flippers = root.selectAll('span.flipper').data(characters);
		flippers
			.style('left', flipperOffset)
			.each(function(d, i) {
				var me = d3.select(this);
				var flipped = (config.animate === true ? me.classed('flipped') : false);
				var nextFace = me.select(flipped || config.animate !== true ? 'span.a' : 'span.b');
				var currValue = me.select(flipped ? 'span.b' : 'span.a').text();
				if ( currValue !== d ) {
					nextFace.select('span.value').text(d);
					if ( config.animate ) {
						me.classed('flipped', !flipped);
					}
				}
			});
		
		flippers.enter().append('span')
				.attr('class', 'flipper')
				.style('left', flipperOffset)
				.html(function(d) {
					// older WebKit versions don't seem to support backface-visibility: hidden, so 
					// completely omit the back face here so CSS styling like shadows don't appear
					return (config.animate ? '<span class="face b"><span class="value">b</span></span>' : '') 
						+ '<span class="face a"><span class="value">' +d +'</span></span>';
				});
		
		flippers.exit().remove();
	}
	that.update = update;

	configure(configuration);
	return that;
};
