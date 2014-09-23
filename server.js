var HciBle = require('./HciBle'),
    http = require('http'),
    os = require('os'),
    port = 8080;

function readUInt24LE(buf, offset, noAssert) {
    return buf.readUInt8(offset + 2, noAssert) << 16 | buf.readUInt16LE(offset, noAssert);
}

function readUInt24BE(buf, offset, noAssert) {
    return buf.readUInt8(offset, noAssert) << 16 | buf.readUInt16BE(offset + 1, noAssert);
}

var ble = new HciBle(),
    temp = -99,
    battery = -99,
    time = Date.now();

ble.on('discover', function(address, addressType, advertisement, rssi) {
    if (advertisement.localName === '8BBAC49D') {
        time = Date.now();
        for (var i in advertisement.serviceData) {
            var serviceData = advertisement.serviceData[i];
            switch (serviceData.uuid) {
                case '1809': // 09 18 # 16-bit Service UUID 0x1809 = Health thermometer (org.bluetooth.service.health_thermometer)
                    temp = readUInt24LE(serviceData.data, 0, false) / 100;
                    break;

                case '180f': // 0F 18 # 16-bit Service UUID 0x180F = Battery Service (org.bluetooth.service.battery_service)
                    battery = serviceData.data.readUInt8(0);
                    break;
            }
        }
    }
    //console.log('Temp: ' + temp + ' °C, Power: ' + power + ' %');
});

ble.startScanning();

http.createServer(function(req, res) {

    var json = JSON.stringify({
        value: temp,
        battery: battery,
        time: time
    });

    res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf8',
        'Content-Length': json.length,
        'Access-Control-Allow-Origin': '*'
    });

    res.end(json);

}).listen(port);

console.log('Listening on ' + os.hostname().toLowerCase() + ':' + port);

process.on('uncaughtException', function(error) {
    console.log('Uncaught Error:', error);
});
