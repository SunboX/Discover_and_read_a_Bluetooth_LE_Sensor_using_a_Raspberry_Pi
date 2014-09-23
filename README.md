Discover and read a Bluetooth LE Sensor using a Raspberry Pi and provide it's data as Web Service
=================================================================================================

I will show you step by step how to discover a Bluetooth 4.0 (Low Energy) Sensor using a Raspberry Pi and a Bluetooth 4.0 Dongle and how to provide the discovered data as simple [REST](http://en.wikipedia.org/wiki/Representational_state_transfer) web service. For this Example I'm using a FreeTec PX-1737-919 Bluetooth 4.0 Temperature Sensor (for iPhone/iPad) a Raspberry Pi Model B and a no-name CSR Blutooth 4.0 Dongle (inside lies a CSR8510 Bluetooth USB host). Not all Bluetooth dongles are Linux-friendly. A resource listing well-behaving ones can be found at the [Embedded Linux Wiki](http://elinux.org/RPi_USB_Bluetooth_adapters). You need a Bluetooth 4.0 one. :wink: Don't plug the Dongle in! We need to install the Bluetooth protocol stack first.

First you have to install the Linux Bluetooth protocol stack, [BlueZ](http://www.bluez.org/) plus some USB development packages.

But as always before starting installing stuff on Raspbian, you should be up-to-date. So run:

```bash
sudo apt-get update
sudo apt-get upgrade
```

â€¦to get you updated.

Next install the required USB development packages by running:

```bash
sudo apt-get install libusb-dev libdbus-1-dev libglib2.0-dev libudev-dev libical-dev libreadline-dev
```

Next we have to manually compile and install BlueZ. Please replace the version number `5.23` with the latest one found here: https://www.kernel.org/pub/linux/bluetooth

Make a directory we will place our bluetooth stuff inside:

```bash
sudo mkdir /opt/bluetooth
cd /opt/bluetooth
```

Download and unpack BlueZ:

```bash
sudo wget https://www.kernel.org/pub/linux/bluetooth/bluez-5.23.tar.gz
sudo tar xvzf bluetooth/bluez-5.23.tar.gz
```

Remove the downloaded file (we keep the unpacked ones):

```bash
sudo rm bluez-5.23.tar.gz
```

Configure, compile and install BlueZ (this may take some time!):

```bash
cd bluez-5.23
sudo ./configure --disable-systemd
sudo make
sudo make install
```

Once Bluez has been built, shut down your Raspberry Pi:

```bash
sudo shutdown -h now
```

If it is halted, plug-in your USB Bluetooth Dongle and power up the Raspberry Pi again. :smiley:

Now let's check if your USB Dongle is available. To do so, change to the directory of your BlueZ installationâ€¦

```bash
cd /opt/bluetooth/bluez-5.23
```

â€¦and run the following command:

```bash
tools/hciconfig
```

It should give you a list of all Bluetooth Devices connected to your Raspberry Pi:

```bash
hci0:	Type: BR/EDR  Bus: USB
	BD Address: 00:1A:7D:DA:71:08  ACL MTU: 310:10  SCO MTU: 64:8
	DOWN 
	RX bytes:188952 acl:0 sco:0 events:4753 errors:0
	TX bytes:788 acl:0 sco:0 commands:57 errors:0
```

If all goes well, you should see the hci0 device (Host Controller Interface). `BD Address` is the Bluetooth address of your Dongle as combination of 12 alphanumeric characters. The address is hexadecimal.

Next you can enable the device with the following command:

```bash
sudo tools/hciconfig hci0 up
```

â€¦and check if it's running by using the `hciconfig` command again:

```bash
tools/hciconfig
```

The `DOWN` should have changed to `UP` and `RUNNING`:

```bash
hci0:	Type: BR/EDR  Bus: USB
	BD Address: 00:1A:7D:DA:71:08  ACL MTU: 310:10  SCO MTU: 64:8
	UP RUNNING 
	RX bytes:188952 acl:0 sco:0 events:4753 errors:0
	TX bytes:788 acl:0 sco:0 commands:57 errors:0
```

First step done, you have succesfully set up your Bluetooth Dongle.
Now switch on your Bluetooth 4.0 (Low Energy) Sensor. In my case, I have to long press the FreeTec Temperature Sensor until the tiny LED inside blinks green for a second.

So let's discover the Bluetooth LE Package / Frame / Beacon the temperature sensor advertises by running the following command:

```bash
sudo hcidump --raw
```

You should see some binary packages like these flying in:

```bash
HCI sniffer - Bluetooth packet analyzer ver 5.23
device: hci0 snap_len: 1500 filter: 0xffffffff
> 04 3E 26 02 01 03 01 B8 AB C0 5D 4C D9 1A 02 01 04 09 09 38 
  42 42 41 43 34 39 44 07 16 09 18 47 08 00 FE 04 16 0F 18 5B 
  B7 
> 04 3E 26 02 01 03 01 B8 AB C0 5D 4C D9 1A 02 01 04 09 09 38 
  42 42 41 43 34 39 44 07 16 09 18 47 08 00 FE 04 16 0F 18 5B 
  B3 
> 04 3E 26 02 01 03 01 B8 AB C0 5D 4C D9 1A 02 01 04 09 09 38 
  42 42 41 43 34 39 44 07 16 09 18 45 08 00 FE 04 16 0F 18 5A 
  BC 
> 04 3E 26 02 01 03 01 B8 AB C0 5D 4C D9 1A 02 01 04 09 09 38 
  42 42 41 43 34 39 44 07 16 09 18 44 08 00 FE 04 16 0F 18 5B 
  B2 
```

If you look at the repeated packets, you will see that each temperature measurement varies slightly, as does the battery level measurement.

Let's break one of these BLE discovered packets down a bit. But first we're fetching some data, that will help us understanding this packet more clearly. Let's get the LE advertising report by running this command:

```bash
sudo hcitool lescan
```

You should see something like this:

```bash
LE Scan ...
D9:4C:5D:C0:AB:B8 8BBAC49D
```

Press `Strg + C` to cancel scanning (`Ctrl + C` on Mac OS X).

If you are seeing a error message like this instead:

```bash
Set scan parameters failed: Input/output error
```

â€¦try to restart your Bluetooth dongle:

```bash
sudo hciconfig hci0 down
sudo hciconfig hci0 up
```

This should fix most i/o errors.

Back to the result of `lescan`:

```bash
D9:4C:5D:C0:AB:B8 8BBAC49D
```

The first `D9:4C:5D:C0:AB:B8` is the Bluetooth address of my temperature sensor as hexadecimal. The second `8BBAC49D` is the complete local name of the sensor.

We will now break down this packet discovered above:

```bash
> 04 3E 26 02 01 03 01 B8 AB C0 5D 4C D9 1A 02 01 04 09 09 38 
  42 42 41 43 34 39 44 07 16 09 18 44 08 00 FE 04 16 0F 18 5B 
  B2 
```

Here is the breakdown of the packet:

```
B8 AB C0 5D 4C D9 1A # Bluetooth Mac Address in reverse order
02 # Number of bytes that follow in first AD structure
01 # Flags AD type
04 # Flags value 0x04 = 000000100  
   bit 0 (OFF) LE Limited Discoverable Mode
   bit 1 (OFF) LE General Discoverable Mode
   bit 2 (ON) BR/EDR Not Supported
   bit 3 (OFF) Simultaneous LE and BR/EDR to Same Device Capable (controller)
   bit 4 (OFF) Simultaneous LE and BR/EDR to Same Device Capable (Host)
09 # Number of bytes that follow in the first AD Structure
09 # Complete Local Name AD Type
38 42 42 41 43 34 39 44 # "8BBAC49D"
07 # Number of bytes that follow in the second AD Structure
16 # Service Data AD Type
09 18 # 16-bit Service UUID 0x1809 = Health thermometer (org.bluetooth.service.health_thermometer)
44 08 00 FE # Additional Service Data 440800  (Temperature = 0x000844 x 10^-2) = 21.16 degrees
04 # Number of bytes that follow in the third AD Structure
16 # Service Data AD Type
0F 18 # 16-bit Service UUID 0x180F  = Battery Service (org.bluetooth.service.battery_service) 
5B # Additional Service Data (battery level)
B2 # checksum
```

See the bluetooth 16-bit service UUID definitions for more information:

* [org.bluetooth.service.health_thermometer](https://developer.bluetooth.org/gatt/services/Pages/ServiceViewer.aspx?u=org.bluetooth.service.health_thermometer.xml)
* [org.bluetooth.service.battery_service](https://developer.bluetooth.org/gatt/services/Pages/ServiceViewer.aspx?u=org.bluetooth.service.battery_service.xml)

You see, parsing these binary packets is bit over the top. Luckily there's a good Node.JS package for discovering Bluetooth LE packets. It's called [noble](https://github.com/sandeepmistry/noble) and comes with a [handy binary](https://github.com/sandeepmistry/noble/blob/master/src/hci-ble.c) we will use. :wink:

First we will install Node.JS. If you are not familiar with Node.JS I recommend giving it a look. It's JavaScript, but running on a server rather than in a browser. It's lightweight, fast and easy to use and works perfect on a small Raspberry Pi.

Compiling Node.JS from source takes a long time. Luckily the Node guys have put a pre-compiled download on there server. You can find the latest downloads at http://nodejs.org/dist/. Replace the used version number below with the latest one on the download site (`dist`).

We will install Node.JS in `/opt`:

```bash
cd /opt
```

Download and unpack Node.JS:

```bash
sudo wget http://nodejs.org/dist/v0.10.28/node-v0.10.28-linux-arm-pi.tar.gz
sudo tar xvzf node-v0.10.28-linux-arm-pi.tar.gz
```

Remove the downloaded file (we keep the unpacked ones):

```bash
sudo rm node-v0.10.28-linux-arm-pi.tar.gz
```

Make a symbolic link into `/opt/node`:

```bash
sudo ln -s node-v0.10.28-linux-arm-pi node
```

Fixe some rights:

```bash
sudo chmod a+rw /opt/node/lib/node_modules
sudo chmod a+rw /opt/node/bin
```

And reference Node.JS in the `PATH` variable at start up:

```bash
echo 'PATH=$PATH:/opt/node/bin' > /etc/profile.d/node.sh
```

Now reboot your Raspberry Pi that the above takes effect:

```bash
sudo reboot
```

If the Rapberry Pi comes back online, check if Node.JS is running using this command:

```bash
node --version
```

You should see the Node version you are running:

```bash
v0.10.28
```

One final step is to install node-gyp. This is not strictly necessary in every case, but you will find it useful if you ever need to build and install any "native" npm modules (like [noble](https://github.com/sandeepmistry/noble) is one of).

```bash
npm install -g node-gyp
```

`npm` is Node's Packet Manager that will automatically be installed with Node.JS.

Now that we have Node running, let's use it to discover my temperature sensor and write a small web service for getting the current temperature and battery level. :smiley:

I've put the demo files into [this](https://github.com/SunboX/Discover_and_read_a_Bluetooth_LE_Sensor_using_a_Raspberry_Pi) GitHub repository. The easiest way to get the files onto your Raspberry Pi is by using Git. So we will install it:

```bash
sudo apt-get install git
```

We will download the demo to `/opt/node-ble-demo`:

```bash
git clone https://github.com/SunboX/Discover_and_read_a_Bluetooth_LE_Sensor_using_a_Raspberry_Pi.git /opt/node-ble-demo
```

Now change into the cloned directory:

```bash
cd /opt/node-ble-demo
```

And check if the server is running:

```bash
sudo node server.js
```

If its working you should see something like this:

```bash
hciBle = /opt/node-ble-demo/build/Release/hci-ble
Listening on localhost:8080
adapterState = poweredOn
```

Now open a new browser tab and navigate to the URL your `server.js` is listening on. In my case it's `http://localhost:8080`.
This should show you a [JSON](http://en.wikipedia.org/wiki/JSON) response of the discovered sensor data:

```json
{"value":21.16,"battery":91,"time":1411489097080}
```

`21.16` is the temperature in degrees and `91` is the remaining battery power in percent. `time` is a timestamp of the time the data was discovered.

Please look at the source code of the [`server.js`](https://github.com/SunboX/Discover_and_read_a_Bluetooth_LE_Sensor_using_a_Raspberry_Pi/blob/master/server.js) for more information. It should be understandable. If not, please file a bug [here](https://github.com/SunboX/Discover_and_read_a_Bluetooth_LE_Sensor_using_a_Raspberry_Pi/issues), and I will explain it a bit more in detail.

If you want to take this script a bit further, you should take a look at [Node Forever](https://github.com/nodejitsu/forever) - a simple CLI tool for ensuring that your server script runs continuously (i.e. forever) and you should look at [init.d scripts](http://labs.telasocial.com/raspberry-nodejs-init.d/). They allow you to easily run your server in the background.

And now here's my temperature sensor online: http://raedel7.andrefiedler.de/
