Adapter for talking to serial-mcu based software through a serial port.

# Configuring the serial port.

The configuration for this adapter is current defaulted to:
```
    "config": {
      "ports": {
        "arduino-usb": {
          "manufacturer": "Arduino"
        }
      }
    }
```
which will scan the available serial ports and look for a USB port with a
manufacterer of 'Arduino', which is what the MKR1000 advertises itself with.

Each entry under `ports` is treated like a filter. The name (i.e. `arduino-usb`) is arbitrary. Each filter can have one of more of the following fields:

| Name | Description |
| ---- | ----------- |
| manufacturer | Matches the manufacturer name for USB serial ports. |
| vendorId | Matches the 4 character hex vendor ID associated with a USB serial port |
| productId | Matches the 4 character hex product ID associated with a USB serial port |
| serialNumber | Matches the serial number associated with a USB serial port |
| comName | Matches the name of the serial port (this works for both USB and non-USB serial ports) |

Each of the filters checks the actual string starts with the string provided in the filter. For example, the MKR1000 advertises a manufacturer of `Arduino_LLC` and since it starts with `Arduino` the `arduino-usb`
filter will match and that serial port will be opened.

There is a Node.js program called list-ports.js which will print all of
ports which were detected as well as which ports match each of the filters
from the config found in the package.json file.

# Some random notes.

These are the set of messages currently needing to be transferred (each
message is formatted using JSON):

```
Sent '{"messageType":"getAdapter","data":{}}'
Rcvd: {"messageType":"adapter","data":{"id":"Arduino-LED","name":"Arduino-LED","thingCount":1}}
Sent '{"messageType":"getThingByIdx","data":{"thingIdx":0}}'
Rcvd: {"messageType":"thing","data":{"id":"ArduinoLED-led-1","name":"led","type":"onOffSwitch","description":"Arduino LED","propertyCount":1}}
Sent '{"messageType":"getPropertyByIdx","data":{"thingIdx":0,"propertyIdx":0}}'
Rcvd: {"messageType":"property","data":{"name":"on","type":"boolean","value":false}}
Sent '{"messageType":"setProperty","data":{"id":"ArduinoLED-led-1","name":"on","value":"true"}}'
Rcvd: {"messageType":"propertyChanged","data":{"id":"ArduinoLED-led-1","name":"on","value":"true"}}
```

The longest message from this simple example is the "thing" message which as JSON is 136 bytes long.

By encoding the messageType as a single byte and removing the labels, this can be dropped to 49 bytes
which is starting to be alot more reasonable for a microcontroller environment.

Further reduction would be possible by retrieving individial fields for adapter/things/properties and since retrieving
those fields only happens at startup, that would probably be another good compromise.

For a binary protocol, we would then have messages like:

- getAdapterId
- getAdapterName
- getAdapterThingCount

- getThingId(thingIndex)
- getThingName(thingIndex)
- getThingType(thingIndex)
- getThingDescription(thingIndex)
- getThingPropertyCount(thingIndex)

- getPropertyName(thingIndex, propertyIndex)
- getPropertyType(thingIndex, propertyIndex)
- getPropertyMin(thingIndex, propertyIndex)
- getPropertyMax(thingIndex, propertyIndex)
- getPropertyUnit(thingIndex, propertyIndex)
- getPropertyValue(thingIndex, propertyIndex)

- setProperty(thingIndex, propertyIndex, value)
- propertyChanged(thingIndex, propertyIndex, value)

This would reduce the max message sent to the MCU to 3 bytes + the max size of a value
And the max message received from the MCU would be a variable length string

The adapter (on the host) would translate indicies into strings based on the data queried.
