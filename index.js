#!/usr/bin/env node

'use strict';

const os = require('os');
const Thingy = require('thingy52');
const MQTT = require('mqtt');

let brokerConnectTaskId = null;
let dataTransmissionTaskId = null;

let connectingToBroker = false;
let cleanup = false;

let mqttClient = null;
let connectedThingy = null;
const thingyState = {
    accel: {
        x: 0,
        y: 0,
        z: 0
    },
    button: false,
    timestamp: 0
};

// Main
// ==========

init();
start();

// App Utils
// ==========

function loadConfig() {
    const config = require('./config');
    let topic = config.mqtt.topic;
    topic = topic.replace('{hostname}', os.hostname());
    config.mqtt.topic = topic;
    return config;
}

function init() {
    process.stdin.resume();
    process.on('exit', exitHandler.bind(null));
    process.on('SIGINT', exitHandler.bind(null));
    process.on('SIGUSR1', exitHandler.bind(null));
    process.on('SIGUSR2', exitHandler.bind(null));
    process.on('uncaughtException', exitHandler.bind(null));
}

function start() {
    const config = loadConfig();
    console.log('=== Thingy:52 to MQTT ===');
    console.log('Configuration:', config);
    console.log('=========================');

    brokerConnectTaskId = startBrokerConnectTask(config);
    startDiscoverThingyTask(config);
    dataTransmissionTaskId = startDataTransmissionTask(config);
}

function stop() {
    if (cleanup) return;
    cleanup = true;
    console.log('=========================');
    stopDataTransmissionTask();
    stopBrokerConnectTask();
    stopDiscoverThingyTask();
}

function exitHandler(options, err) {
    try {
        stop();
    } catch (e) {
        console.log(e.stack);
        process.exit(-1);
    }
    if (err) {
        console.log(err.stack);
        process.exit(-1);
    } else {
        process.exit();
    }
}

// Broker Utils
// ==========

function startBrokerConnectTask(config) {
    console.log('[MQTT] Start Broker Connect Task ...');
    const connectionInterval = 3 * 1000;
    return setInterval(function () {
        if (connectingToBroker || !mqttClient) {
            brokerConnect(config.mqtt);
        }
    }, connectionInterval);
}

function stopBrokerConnectTask() {
    console.log('[MQTT] Stop Broker Connect Task ...');
    clearInterval(brokerConnectTaskId);
    brokerDisconnect();
}

function brokerConnect(mqttConfig) {
    connectingToBroker = true;
    const mqttAddr = mqttConfig.host + ':' + mqttConfig.port;
    console.log('[MQTT] Connecting to: ' + mqttAddr);

    const client = MQTT.connect({
        protocol: 'mqtt',
        host: mqttConfig.host,
        port: mqttConfig.port,
    });

    client.on('connect', connectionSuccessHandler);
    client.on('close', connectionProblemsHandler);
    client.on('error', connectionProblemsHandler);
    client.on('end', connectionProblemsHandler);
    client.on('offline', connectionProblemsHandler);

    function connectionSuccessHandler() {
        mqttClient = client;
        console.log('[MQTT] Successfully connected to: ' + mqttAddr);
        connectingToBroker = false;

    }

    function connectionProblemsHandler(err) {
        if (err) {
            console.log('[MQTT] Connection problem, disconnecting ... ', err);
            brokerDisconnect();
            connectingToBroker = false;
        }
    }
}

function brokerDisconnect() {
    if (mqttClient) {
        mqttClient.end(true);
        mqttClient = null;
    }
}

// Thingy Utils
// ==========

function startDiscoverThingyTask(config) {
    console.log('[BLE] Start Discovery Task ...');
    const id = macToId(config.ble.deviceMac);
    Thingy.discoverWithFilter(function(device) {
        console.log('[BLE] Discover:',  device.id, 'target:', id);
        if (id === '*') return true;
        return id === device.id;
    }, handleDiscover);

    function handleDiscover(thingy) {
        if (!connectedThingy) {
            connectAndSetupThingy(thingy);
        }
    }
}

function stopDiscoverThingyTask(disconnected) {
    console.log('[BLE] Stop Discovery Task ...');
    Thingy.stopDiscover(function(err) {
        if (err) {
            console.log(err);
        }
    });
    disconnectThingy(disconnected);
}

/**
 * Restart discovery task as workaround for noble-device issue.
 * */
function restartDiscoverThingyTask(disconnected) {
    const config = loadConfig();
    stopDiscoverThingyTask(disconnected);
    setTimeout(function () {
        startDiscoverThingyTask(config);
    }, 5 * 1000);
}


function connectAndSetupThingy(thingy) {
    console.log('[BLE] Connecting to the Thingy:52', thingy.id);
    thingy.connectAndSetUp(function(error) {
        if (error) handleError(error);
        else  {
            // User Interface
            thingy.led_breathe({
                color: 2,
                intensity: 100,
                delay: 1000,
            });
            thingy.button_enable(handleError);
            thingy.on('buttonNotif', function(state) {
                if (state === 'Pressed') {
                    thingyState.button = true;
                }
            });
            // Sensors
            thingy.raw_enable(handleError);
            thingy.on('rawNotif', function(rawData) {
                thingyState.accel.x = rawData.accelerometer.x;
                thingyState.accel.y = rawData.accelerometer.y;
                thingyState.accel.z = rawData.accelerometer.z;
            });
            // Service
            thingy.on('disconnect', function() {
                console.log('[BLE] Thingy:52 disconnected');
                restartDiscoverThingyTask(true)
            });
            connectedThingy = thingy;
            console.log('[BLE] Successfully connected to ', thingy.id);
        }
    });
    
    function handleError(error) {
        if (error) {
            console.log('[BLE] Connection/Setup problem, disconnecting ...', error);
            restartDiscoverThingyTask();
        }
    }
}

function disconnectThingy(disconnected) {
    if (!disconnected && connectedThingy) {
        connectedThingy.disconnect();
    }
    connectedThingy = null;
}

function macToId(mac) {
    return mac.toLowerCase().replace(new RegExp(':', 'g'), '');
}

// Transmission Utils
// ==========

function startDataTransmissionTask(config) {
    console.log('[TRS] Start Transmission Task ...');
    const transmissionInterval = 3 * 1000;
    return setInterval(function () {
        if (mqttClient && connectedThingy) {
            transmission(config.mqtt);
        }
    }, transmissionInterval);
}

function stopDataTransmissionTask() {
    console.log('[TRS] Stop Transmission Task ...');
    clearInterval(dataTransmissionTaskId);
}

function transmission(config) {
    thingyState.timestamp = Math.round((new Date()).getTime() / 1000);
    const msg = JSON.stringify(thingyState);
    mqttClient.publish(config.topic, msg);
    console.log('[TRS] Publish to ' + config.topic + ' ' + msg);
    thingyState.button = false;
}
