var events = require('events');
var spawn = require('child_process').spawn;
var util = require('util');

var HciBle = function() {
    var hciBle = __dirname + '/build/Release/hci-ble';

    console.log('hciBle = ' + hciBle);

    this._hciBle = spawn(hciBle);
    this._hciBle.on('close', this.onClose.bind(this));

    this._hciBle.stdout.on('data', this.onStdoutData.bind(this));
    this._hciBle.stderr.on('data', this.onStderrData.bind(this));

    this._hciBle.on('error', function() {});

    this._buffer = "";

    this._discoveries = {};
};

util.inherits(HciBle, events.EventEmitter);

HciBle.prototype.onClose = function(code) {
    console.log('close = ' + code);
};

HciBle.prototype.onStdoutData = function(data) {
    this._buffer += data.toString();

    //console.log('buffer = ' + JSON.stringify(this._buffer));

    var newLineIndex;
    while ((newLineIndex = this._buffer.indexOf('\n')) !== -1) {
        var line = this._buffer.substring(0, newLineIndex);
        var found;

        this._buffer = this._buffer.substring(newLineIndex + 1);

        //console.log('line = ' + line);

        if ((found = line.match(/^adapterState (.*)$/))) {
            var adapterState = found[1];

            console.log('adapterState = ' + adapterState);

            if (adapterState === 'unauthorized') {
                console.log('noble warning: adapter state unauthorized, please run as root or with sudo');
            }

            this.emit('stateChange', adapterState);
        } else if ((found = line.match(/^event (.*)$/))) {
            var event = found[1];
            var splitEvent = event.split(',');

            var address = splitEvent[0];
            var addressType = splitEvent[1];
            var eir = new Buffer(splitEvent[2], 'hex');
            var rssi = parseInt(splitEvent[3], 10);

            //console.log('address = ' + address);
            //console.log('addressType = ' + addressType);
            //console.log('eir = ' + eir.toString('hex'));
            //console.log('rssi = ' + rssi);

            var previouslyDiscovered = !!this._discoveries[address];
            var advertisement = previouslyDiscovered ? this._discoveries[address].advertisement : {
                localName: undefined,
                txPowerLevel: undefined,
                manufacturerData: undefined,
                serviceData: [],
                serviceUuids: []
            };

            var discoveryCount = previouslyDiscovered ? this._discoveries[address].count : 0;

            if (discoveryCount % 2 === 0) {
                // reset service data every second event
                advertisement.serviceData = [];
            }

            var i = 0;
            var j = 0;
            var serviceUuid = null;

            while ((i + 1) < eir.length) {
                var length = eir.readUInt8(i);
                var type = eir.readUInt8(i + 1); // https://www.bluetooth.org/en-us/specification/assigned-numbers/generic-access-profile

                if ((i + length + 1) > eir.length) {
                    console.log('invalid EIR data, out of range of buffer length');
                    break;
                }

                var bytes = eir.slice(i + 2).slice(0, length - 1);

                switch (type) {
                    case 0x02: // Incomplete List of 16-bit Service Class UUID
                    case 0x03: // Complete List of 16-bit Service Class UUIDs
                        for (j = 0; j < bytes.length; j += 2) {
                            serviceUuid = bytes.readUInt16LE(j).toString(16);
                            if (advertisement.serviceUuids.indexOf(serviceUuid) === -1) {
                                advertisement.serviceUuids.push(serviceUuid);
                            }
                        }
                        break;

                    case 0x06: // Incomplete List of 128-bit Service Class UUIDs
                    case 0x07: // Complete List of 128-bit Service Class UUIDs
                        for (j = 0; j < bytes.length; j += 16) {
                            serviceUuid = bytes.slice(j, j + 16).toString('hex').match(/.{1,2}/g).reverse().join('');
                            if (advertisement.serviceUuids.indexOf(serviceUuid) === -1) {
                                advertisement.serviceUuids.push(serviceUuid);
                            }
                        }
                        break;

                    case 0x08: // Shortened Local Name
                    case 0x09: // Complete Local Name»
                        advertisement.localName = bytes.toString('utf8');
                        break;

                    case 0x0a: // Tx Power Level
                        advertisement.txPowerLevel = bytes.readInt8(0);
                        break;

                    case 0x16: // Service Data, there can be multiple occurences
                        var serviceDataUuid = bytes.slice(0, 2).toString('hex').match(/.{1,2}/g).reverse().join('');
                        var serviceData = bytes.slice(2, bytes.length);
                        var found = false;
                        for (var i in advertisement.serviceData) {
                            var obj = advertisement.serviceData[i];
                            if (obj.uuid == serviceDataUuid) {
                                found = true;
                                break;
                            }
                        }
                        if (!found) {
                            advertisement.serviceData.push({
                                uuid: serviceDataUuid,
                                data: serviceData
                            });
                        }
                        break;

                    case 0xff: // Manufacturer Specific Data
                        advertisement.manufacturerData = bytes;
                        break;
                }

                i += (length + 1);
            }

            //console.log('advertisement = ' + JSON.stringify(advertisement, null, 0));

            this._discoveries[address] = {
                address: address,
                addressType: addressType,
                advertisement: advertisement,
                rssi: rssi,
                count: (discoveryCount + 1)
            };

            // only report after an even number of events, so more advertisement data can be collected
            if (this._discoveries[address].count % 2 === 0) {
                this.emit('discover', address, addressType, advertisement, rssi);
            }
        }
    }
};

HciBle.prototype.onStderrData = function(data) {
    console.error('stderr: ' + data);
};

HciBle.prototype.startScanning = function(allowDuplicates) {
    this._hciBle.kill(allowDuplicates ? 'SIGUSR2' : 'SIGUSR1');

    this.emit('scanStart');
};

HciBle.prototype.stopScanning = function() {
    this._hciBle.kill('SIGHUP');

    this.emit('scanStop');
};

HciBle.prototype.startAdvertising = function(name, serviceUuids) {
    console.log('startAdvertising: name = ' + name + ', serviceUuids = ' + JSON.stringify(serviceUuids, null, 2));

    var advertisementDataLength = 3;
    var scanDataLength = 0;

    var serviceUuids16bit = [];
    var serviceUuids128bit = [];
    var i = 0;
    var j = 0;
    var k = 0;

    if (name && name.length) {
        scanDataLength += 2 + name.length;
    }

    if (serviceUuids && serviceUuids.length) {
        for (i = 0; i < serviceUuids.length; i++) {
            var serviceUuid = new Buffer(serviceUuids[i].match(/.{1,2}/g).reverse().join(''), 'hex');

            if (serviceUuid.length === 2) {
                serviceUuids16bit.push(serviceUuid);
            } else if (serviceUuid.length === 16) {
                serviceUuids128bit.push(serviceUuid);
            }
        }
    }

    if (serviceUuids16bit.length) {
        advertisementDataLength += 2 + 2 * serviceUuids16bit.length;
    }

    if (serviceUuids128bit.length) {
        advertisementDataLength += 2 + 16 * serviceUuids128bit.length;
    }

    i = 0;
    var advertisementData = new Buffer(advertisementDataLength);

    // flags
    advertisementData[i++] = 2;
    advertisementData[i++] = 0x01;
    advertisementData[i++] = 0x05;

    if (serviceUuids16bit.length) {
        advertisementData[i++] = 1 + 2 * serviceUuids16bit.length;
        advertisementData[i++] = 0x03;
        for (j = 0; j < serviceUuids16bit.length; j++) {
            for (k = 0; k < serviceUuids16bit[j].length; k++) {
                advertisementData[i++] = serviceUuids16bit[j][k];
            }
        }
    }

    if (serviceUuids128bit.length) {
        advertisementData[i++] = 1 + 16 * serviceUuids128bit.length;
        advertisementData[i++] = 0x06;
        for (j = 0; j < serviceUuids128bit.length; j++) {
            for (k = 0; k < serviceUuids128bit[j].length; k++) {
                advertisementData[i++] = serviceUuids128bit[j][k];
            }
        }
    }

    i = 0;
    var scanData = new Buffer(scanDataLength);

    // name
    if (name && name.length) {
        var nameBuffer = new Buffer(name);

        scanData[i++] = nameBuffer.length + 1;
        scanData[i++] = 0x08;
        for (j = 0; j < nameBuffer.length; j++) {
            scanData[i++] = nameBuffer[j];
        }
    }

    this.startAdvertisingWithEIRData(advertisementData, scanData);
};


HciBle.prototype.startAdvertisingIBeacon = function(data) {
    console.log('startAdvertisingIBeacon: data = ' + data.toString('hex'));

    var dataLength = data.length;
    var manufacturerDataLength = 6 + dataLength;
    var advertisementDataLength = 3 + manufacturerDataLength;
    var scanDataLength = 0;

    i = 0;
    var advertisementData = new Buffer(advertisementDataLength);

    // flags
    advertisementData[i++] = 2;
    advertisementData[i++] = 0x01;
    advertisementData[i++] = 0x05;

    // manufacturer data
    advertisementData[i++] = manufacturerDataLength - 1;
    advertisementData[i++] = 0xff;
    advertisementData[i++] = 0x4c; // Apple Company Identifier LE (16 bit)
    advertisementData[i++] = 0x00;
    advertisementData[i++] = 0x02; // type, 2 => iBeacon
    advertisementData[i++] = dataLength;

    for (var j = 0; j < dataLength; j++) {
        advertisementData[i++] = data[j];
    }

    i = 0;
    var scanData = new Buffer(scanDataLength);

    this.startAdvertisingWithEIRData(advertisementData, scanData);
};

HciBle.prototype.startAdvertisingWithEIRData = function(advertisementData, scanData) {
    console.log('startAdvertisingWithEIRData: advertisement data = ' + advertisementData.toString('hex') + ', scan data = ' + scanData.toString('hex'));

    var error = null;

    if (advertisementData.length > 31) {
        error = new Error('Advertisement data is over maximum limit of 31 bytes');
    } else if (scanData.length > 31) {
        error = new Error('Scan data is over maximum limit of 31 bytes');
    } else {
        this._hciBle.stdin.write(advertisementData.toString('hex') + ' ' + scanData.toString('hex') + '\n');
    }

    this.emit('advertisingStart', error);
};

HciBle.prototype.restartAdvertising = function(name, serviceUuids) {
    this._hciBle.kill('SIGUSR1');
};

HciBle.prototype.stopAdvertising = function() {
    this._hciBle.kill('SIGHUP');

    this.emit('advertisingStop');
};

module.exports = HciBle;
