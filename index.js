#!/usr/bin/env node

'use strict';

const os = require('os');
const Thingy = require('thingy52');
const MQTT = require('mqtt');

let mqttClient = null;
let connectedThingy = null;
const thingyData = {
    accel: {
        x:0,
        y:0,
        z:0
    },
    button: false,
    timestamp: 0
};

bootstrap();

function bootstrap() {
    const config = loadConfig();
    console.log('=== Thingy:52 to MQTT ===');
    console.log('Configuration:', config);
    console.log('=========================');

    mqttConnectionLoop(config);
    discoverThingy();
    transmissionLoop(config);
}

function loadConfig() {
    const config = require('./config');
    let topic = config.mqtt.topic;
    topic = topic.replace('{hostname}', os.hostname());
    config.mqtt.topic = topic;
    return config;
}

function mqttConnect(mqttConfig) {
    const client = MQTT.connect({
        protocol: 'mqtt',
        host: mqttConfig.host,
        port: mqttConfig.port
    });

    const mqttAddr = mqttConfig.host + ':' + mqttConfig.port;

    console.log('[MQTT] Connecting to: ' + mqttAddr);


    client.on('connect', connectionSuccessHandler);
    client.on('close', connectionProblemsHandler);
    client.on('error', connectionProblemsHandler);
    client.on('end', connectionProblemsHandler);
    client.on('offline', connectionProblemsHandler);

    function connectionSuccessHandler() {
        if (!mqttClient) {
            mqttClient = client;
            console.log('[MQTT] Successfully connected to: ' + mqttAddr);
        }
    }

    function connectionProblemsHandler(err) {
        if (mqttClient) {
            console.log('[MQTT] Connection problem, disconnecting ... ', err);
            client.end(true);
            mqttClient = null;
        }
    }
}

function mqttConnectionLoop(config) {
    console.log('[MQTT] Enter in to connection loop ...');
    const connectionInterval = 10 * 1000;
    setInterval(function () {
        if (!mqttClient) {
            mqttConnect(config.mqtt);
        }
    }, connectionInterval);
}

function discoverThingy() {
    console.log('[BLE] Searching for Thingy:52 ...');
    Thingy.discover(handleDiscover);

    function handleDiscover(thingy) {
        if (!connectedThingy) {
            connectAndSetupThingy(thingy);
        }
    }
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
                    thingyData.button = true;
                }
            });
            // Sensors
            thingy.raw_enable(handleError);
            thingy.on('rawNotif', function(rawData) {
                thingyData.accel.x = rawData.accelerometer.x;
                thingyData.accel.y = rawData.accelerometer.y;
                thingyData.accel.z = rawData.accelerometer.z;
            });
            connectedThingy = thingy;
            console.log('[BLE] Successfully connected to ', thingy.id);
        }
    });
    
    function handleError(error) {
        if (error) {
            console.log('[BLE] Connection/Setup problem, disconnecting ...', error);
            connectedThingy = null;
        }
    }
}

function transmission(config) {
    thingyData.timestamp = Math.round((new Date()).getTime() / 1000);
    const msg = JSON.stringify(thingyData);
    mqttClient.publish(config.topic, msg);
    console.log('[TRS] Publish to ' + config.topic + ' ' + msg);
    thingyData.button = false;
}

function transmissionLoop(config) {
    console.log('[TRS] Enter in to transmission loop ...');
    const transmissionInterval = 3 * 1000;
    setInterval(function () {
        if (mqttClient && connectedThingy) {
            transmission(config.mqtt);
        }
    }, transmissionInterval);
}