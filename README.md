DeviceOps Hello World
====
Example of snapped Node.js application for communications with [Nordic Thingy:52](https://www.nordicsemi.com/eng/Products/Nordic-Thingy-52).
The application is daemon which discovers Nordic Thingy:52 and resends data to MQTT Broker according to the [config file](./config.json).

## Configuration

Configuration file: [./config.json](./config.json)
 
 * `ble` - section store configuration related with Bluetooth
 * `ble.deviceMAC` - string can be `"*"` and connects to any available Nordic Thingy:52 or `"CF:AA:13:A1:5C:A5"` and connects to particular device
 * `mqtt` - configuration of connection to MQTT Broker
 * `mqtt.topic` - can contain placeholder `{hostname}` which will be replaced by gateway hostname on application startup

## Prerequisites

Make sure you have [Node.js](http://nodejs.org/) (>=6.11.4) installed.
This application is using [Nordic-Thingy52-Nodejs](https://github.com/NordicPlayground/Nordic-Thingy52-Nodejs) to handle the Bluetooth connection.

#### Linux

 * Kernel version 3.6 or above
 * ```libbluetooth-dev```

#### Ubuntu/Debian/Raspbian (locally)

```bash
sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev
```

## Running locally

```bash
git clone git@git.rigado.com:cascade/deviceops-hello-world.git
cd deviceops-hello-world
git checkout develop
npm install
npm run start
```

## Building snap

#### RPI3 Ubuntu Core 16.04 (armhf)

 * Setup [development tools](https://developer.ubuntu.com/core/get-started/developer-setup) (snap classic)

```bash
snap install classic --edge --devmode
sudo classic
sudo apt update
sudo apt install snapcraft build-essential git
```

 * Install [BlueZ](http://www.bluez.org/)

```bash
snap install bluez
snap connect bluez:bluetooth-control
snap connect bluez:network-control
snap connect bluez:home
```

 * Go to the project directory run: ```snapcraft```
 * Result file is `./deviceops-hello-world_0.0.1_armhf.snap`

## Installing snap

#### Rigado VESTA200B Ubuntu Core 16.04 (armhf)
 
 * Setup brand packages: 

```bash
snap stop --disable rigado-devkit
snap install rigado-edge-connect --edge --devmode
snap connect rigado-edge-connect:bluetooth-control
snap connect rigado-edge-connect:physical-memory-control
```

 * Install [BlueZ](http://www.bluez.org/)

```bash
snap install bluez
snap connect bluez:bluetooth-control
snap connect bluez:network-control
snap connect bluez:home
```

 * Copy `./deviceops-hello-world_0.0.1_armhf.snap` in to the gateway home directory.
 * Run install command: `sudo snap install ~/deviceops-hello-world_0.0.1_armhf.snap --dangerous`
 * Connect plugs:

```bash
snap stop --disable deviceops-hello-world
snap connect deviceops-hello-world:network :network
snap connect deviceops-hello-world:bluetooth-control :bluetooth-control
snap connect deviceops-hello-world:network-control :network-control
snap start --enable deviceops-hello-world
```

## Troubleshoot

#### HCI devices list is empty

 * `sudo bluez.hcitool dev` show empty list of devices. 
 * Enable HCI devices:

```bash
sudo bluez.bluetoothctl
power on
```

#### CERT_NOT_YET_VALID when snap is crafting
 
 * Switch to `classic` mode.
 * Execute following commands:

```bash
sudo service ntp stop
sudo ntpdate -s time.nist.gov
sudo service ntp start
sudo update-ca-certificates
```

#### `Command Disallowed (0xc)` while app is running on VESTA Gateway

By default, the application uses `hci0` interface which can be locked by other snap.
To avoid this issue disable or remove other snaps which use `hci0` interface.