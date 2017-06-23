/**
 * @require d3 3.0
 * @require queue 1.0
 * @require solarnetwork-d3 0.2.0
 * @require xterm 2.7
 */

(function(window) {
'use strict';

var devEnv = {
	// comment out these for production
	debug: true,
	tls: false,
	host: 'solarnetworkdev.net:8680'
};

var ansiEscapes = {
	color: {
		bright: {
			green:	'\x1B[32;1m',
			red:	'\x1B[31;1m',
			yellow:	'\x1B[33;1m',
			white:	'\x1B[37;1m'
		},
	},
	reset:	'\x1B[0m',
};

var app;

var solarSshApp = function(nodeUrlHelper, options) {
	var self = { version : '0.1.0' };
	var helper = sn.net.securityHelper();
	var config = (options || {});
	var terminal;
	var session;
	var socket;
	var socketState = 0;

	function hostURL() {
		return ('http' +(config.solarSshTls === true ? 's' : '') +'://' +config.solarSshHost);
	}

	function baseURL() {
		return (hostURL() +config.solarSshPath +'/api/v1/ssh');
	}

	function webSocketURL() {
		return ('ws' +(config.solarSshTls === true ? 's' : '') +'://' +config.solarSshHost +config.solarSshPath +'/ssh');
	}

	function enableSubmit(value) {
		d3.select('#connect').property('disabled', !value);
	}

	function termWriteBrightGreen(text, newline) {
		var value = ansiEscapes.color.bright.green +text +ansiEscapes.reset;
		if ( newline ) {
			terminal.writeln(value);
		} else {
			terminal.write(value);
		}
	}

	function termWriteBrightRed(text, newline) {
		var value = ansiEscapes.color.bright.red +text +ansiEscapes.reset;
		if ( newline ) {
			terminal.writeln(value);
		} else {
			terminal.write(value);
		}
	}

	function termWriteSuccess(withoutNewline) {
		termWriteBrightGreen('SUCCESS', !withoutNewline);
	}

	function termWriteFailed(withoutNewline) {
		termWriteBrightRed('FAILED', !withoutNewline);
	}

	function executeWithPreSignedAuthorization(method, url, authorization) {
		var req = d3.json(url);
		req.on('beforesend', function(request) {
			request.setRequestHeader('X-SN-Date', authorization.dateHeader);
			request.setRequestHeader('X-SN-PreSignedAuthorization', authorization.header);
		});
		console.log('Requesting %s %s', method, url);
		req.send(method);
		return req;
	}

	function connect() {
		helper.token(d3.select('input[name=token]').property('value'));
		helper.secret(d3.select('input[name=secret]').property('value'));
		enableSubmit(false);
		console.log('connect using token %s', helper.token());
		createSession();
	}

	function createSession() {
		var url = baseURL() + '/session/new?nodeId=' +nodeUrlHelper.nodeId;
		var authorization = helper.computeAuthorization(
			nodeUrlHelper.viewPendingInstructionsURL(),
			'GET',
			undefined,
			undefined,
			new Date()
		);
		terminal.write('Requesting new SSH session... ');
		return executeWithPreSignedAuthorization('GET', url, authorization)
			.on('load', handleCreateSession)
			.on('error', function(xhr) {
				console.error('Failed to create session: %s', xhr.responseText);
				enableSubmit(true);
				termWriteFailed();
				termWriteBrightRed('Failed to get request new SSH session: ' +xhr.responseText, true);
			});
	}

	function handleCreateSession(json) {
		if ( !(json.success && json.data && json.data.sessionId) ) {
			console.error('Failed to create session: %s', JSON.stringify(json));
			enableSubmit(true);
			return;
		}
		termWriteSuccess();
		console.log('Created session %s', json.data.sessionId);
		session = json.data;
		startSession();
	}

	function startSession() {
		var url = baseURL() + '/session/' +session.sessionId +'/start';
		var authorization = helper.computeAuthorization(
			nodeUrlHelper.queueInstructionURL('StartRemoteSsh', [
				{name: 'host', value: session.host},
				{name: 'user', value: session.sessionId},
				{name: 'port', value: session.port},
				{name: 'rport', value: session.reversePort }
			]),
			'POST',
			undefined,
			'application/x-www-form-urlencoded',
			new Date()
		);
		terminal.write('Requesting SolarNode to connect to remote SSH session... ');
		return executeWithPreSignedAuthorization('GET', url, authorization)
			.on('load', handleStartSession)
			.on('error', function(xhr) {
				console.error('Failed to start session: %s', xhr.responseText);
				enableSubmit(true);
			});
	}

	function handleStartSession(json) {
		if ( !(json.success && json.data && json.data.sessionId) ) {
			console.error('Failed to start session: %s', JSON.stringify(json));
			enableSubmit(true);
			return;
		}
		termWriteSuccess();
		console.log('Started session %s', json.data.sessionId);
		session = json.data;
		waitForStartRemoteSsh();
	}

	function waitForStartRemoteSsh() {
		terminal.write('Waiting for SolarNode to connect to remote SSH session...');
		var url = nodeUrlHelper.viewInstruction(session.startInstructionId);
		function executeQuery() {
			helper.json(url)
				.on('load', function(json) {
					if ( !(json.success && json.data && json.data.state) ) {
						console.error('Failed to query StartRemoteSsh instruction %d: %s', session.startInstructionId, JSON.stringify(json));
						enableSubmit(true);
						return;
					}
					var state = json.data.state;
					if ( 'Completed' === state ) {
						// off to the races!
						terminal.write(' ');
						termWriteSuccess();
						connectWebSocket();
					} else if ( 'Declined' === state ) {
						// bummer!
						terminal.write(' ');
						termWriteFailed();
						enableSubmit(true);
					} else {
						// still waiting... try again in a little bit
						terminal.write('.');
						setTimeout(executeQuery, 15000);
					}
				})
				.on('error', function(xhr) {
					console.error('Failed to query StartRemoteSsh instruction %d: %s', session.startInstructionId, xhr.responseText);
					enableSubmit(true);
					terminal.write(' ');
					termWriteFailed();
					termWriteBrightRed('Failed to get SolarNode remote SSH session start status: ' +xhr.responseText, true);
				})
				.send('GET');
		}
		executeQuery();
	}

	function connectWebSocket() {
		terminal.write('Attaching to SSH session... ');
		var url = webSocketURL() +'?sessionId=' +session.sessionId;
		socket = new WebSocket(url, 'solarssh');
		socket.onopen = webSocketOpen;
		socket.onmessage = webSocketMessage;
		socket.onerror = webSocketError;
		socket.onclose = webSocketClose;
		//terminal.attach(socket);
	}

	function webSocketOpen(event) {
		// send
		var authorization = helper.computeAuthorization(
			nodeUrlHelper.viewNodeMetadataURL(),
			'GET',
			undefined,
			undefined,
			new Date()
		);

		var msg = {
			cmd: "attach-ssh",
			data: {
				'authorization': authorization.header,
				'authorization-date': authorization.date.getTime(),
				'username': 'solar', // TODO
				'password': 'solar', // TODO
			}
		};

		socket.send(JSON.stringify(msg));
	}

	function webSocketClose(event) {
		console.log('ws close event: %s', JSON.stringify(event));
	}

	function webSocketError(event) {
		console.log('ws error event: %s', JSON.stringify(event));
	}

	function webSocketMessage(event) {
		var msg;
		// TODO: do we have any socketState values other than 0/1?
		switch ( socketState ) {
			case 0:
				msg = JSON.parse(event.data);
				if ( msg.success ) {
					termWriteSuccess();
					socketState = 1;
					terminal.attach(socket);
				} else {
					termWriteFailed();
					termWriteBrightRed('Failed to attach to SSH session: ' +event.data, true);
					enableSubmit(true);
					socket.close();
				}
				break;
		}
	}

	function start() {
		terminal = new Terminal();
		terminal.open(document.getElementById('terminal'), true);
		terminal.writeln('Hello from \x1B[33;1mSolar\x1B[30;1mSSH\x1B[0m!');
	}

	function init() {
		d3.select('#connect').on('click', connect);
		return Object.defineProperties(self, {
			start: { value: start },
		});
	}

	return init();
};

function setupUI(env) {
	d3.selectAll('.node-id').text(env.nodeId);
}

function startApp(env) {
	var urlHelper;

	if ( !env ) {
		env = sn.util.copy(devEnv, sn.util.copy(sn.env, {
			nodeId : 167,
			solarSshHost: 'solarnetworkdev.net:8080',
			solarSshPath: '/solarssh',
			solarSshTls: false,
		}));
	}

	setupUI(env);

	urlHelper = sn.api.node.nodeUrlHelper(env.nodeId, env);

	app = solarSshApp(urlHelper, env)
		.start();

	return app;
}

sn.runtime.solarSshApp = startApp;

}(window));
