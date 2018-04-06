DeviceOps Hello World
====
Example of snapped Node.js application for communications with [Nordic Thingy:52](https://www.nordicsemi.com/eng/Products/Nordic-Thingy-52).
The application is daemon which discovers Nordic Thingy:52 and resends data to MQTT Broker according to the [config file](./config.json).

## Configuration

Configuration file: [./config.json](./config.json)
 
 * `ble` - section store configuration related with Bluetooth
 * `ble.deviceMac` - string can be `"*"` and connects to any available Nordic Thingy:52 or `"CF:AA:13:A1:5C:A5"` and connects to particular device
 * `mqtt` - configuration of connection to MQTT Broker
 * `mqtt.topic` - can contain placeholder `{hostname}` which will be replaced by gateway hostname on application startup

## Prerequisites

Make sure you have [Node.js](http://nodejs.org/) (>=6.11.4) installed.
This application is using [Nordic-Thingy52-Nodejs](https://github.com/NordicPlayground/Nordic-Thingy52-Nodejs) to handle the Bluetooth connection.

#### Linux

 * Kernel version 3.6 or above
 * ```libbluetooth-dev```

#### Ubuntu/Debian/Raspbian (locally)

```sh
    sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev
```

## Running locally
```sh
    git clone git@git.rigado.com:cascade/deviceops-hello-world.git
    cd deviceops-hello-world
    git checkout develop
    npm install
    npm run start
```

## Building snap

#### RPI3 Ubuntu Core 16.04 (armhf)

 * Setup [development tools](https://developer.ubuntu.com/core/get-started/developer-setup) (snap classic)
 * ```sh
   snap install classic --edge --devmode
   sudo classic
   sudo apt update
   sudo apt install snapcraft build-essential git```
 * Install [BlueZ](http://www.bluez.org/)
 * ```sh
   snap install bluez
   snap connect bluez:bluetooth-control```
 * Go to the project directory run: ```snapcraft```
 * Result file is `./deviceops-hello-world_0.0.1_armhf.snap`

## Installing snap

#### Rigado VESTA200B Ubuntu Core 16.04 (armhf)
 
 * Setup edge packages:
```sh
    snap install rigado-edge-connect --edge --devmode
    snap connect rigado-edge-connect:bluetooth-control
    snap connect rigado-edge-connect:physical-memory-control
```
 * Install [BlueZ](http://www.bluez.org/)
```sh
    snap install bluez
```
 * Copy `./deviceops-hello-world_0.0.1_armhf.snap` in to the gateway home directory.
 * Run install command: `sudo snap install ~/deviceops-hello-world_0.0.1_armhf.snap --devmode --dangerous`

## Troubleshoot

#### HCI Devices list is empty

 * `sudo bluez.hcitool dev` show empty list of devices. 
 * `dmesg | grep blue` show: 
```
    [ 1447.938933] audit: type=1400 audit(1522961095.899:76): apparmor="DENIED" operation="create" profile="snap.bluez.hcicofig" pid=4254 family="bluetooth" sock_type="raw" protocol=1 requested_mask="create" denied_mask="create"
```
 * Reinstall [BlueZ](http://www.bluez.org/) with `--devmode` flag:
```sh
    snap install bluez --devmode
    snap connect bluez:bluetooth-control
```
 * Enable HCI devices:
```sh
    sudo bluez.bluetoothctl
    power on
    scan on
```