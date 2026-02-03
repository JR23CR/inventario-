/**
 * bluetooth_printer.js
 * Lógica compartida para conexión Bluetooth con impresoras térmicas (MHT-L1081, etc.)
 * Maneja conexión manual y reconexión automática.
 */

var bluetoothDevice = null;
var printCharacteristic = null;

// Servicios conocidos para solicitar permiso (MHT y genéricos)
const PRINTER_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000ae30-0000-1000-8000-00805f9b34fb'
];

async function getPrintCharacteristic(server) {
    // Intento 1: Servicio 18F0 (Estándar MHT nuevo)
    try {
        const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
        return await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
    } catch (e) {
        console.log("Servicio 18F0 no disponible, probando FF00...");
    }

    // Intento 2: Servicio FF00 (Estándar MHT antiguo / genérico)
    try {
        const service = await server.getPrimaryService('0000ff00-0000-1000-8000-00805f9b34fb');
        return await service.getCharacteristic('0000ff02-0000-1000-8000-00805f9b34fb');
    } catch (e) {
        console.log("Servicio FF00 no disponible.");
    }

    throw new Error("No se encontró un servicio de impresión compatible.");
}

async function conectarBluetooth() {
    try {
        bluetoothDevice = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: PRINTER_SERVICES
        });

        const server = await bluetoothDevice.gatt.connect();
        printCharacteristic = await getPrintCharacteristic(server);
        
        alert("✅ Conectado a " + bluetoothDevice.name);
        return printCharacteristic;
    } catch (error) {
        console.log("Cancelado o Error: " + error);
        if (!String(error).includes("cancelled")) {
            alert("Error de conexión: " + error.message);
        }
    }
}

async function reconectarBluetoothAutomaticamente() {
    if (navigator.bluetooth && navigator.bluetooth.getDevices) {
        try {
            const devices = await navigator.bluetooth.getDevices();
            const myPrinter = devices.find(d => d.name && (d.name.includes('MTH') || d.name.includes('Printer')));
            
            if (myPrinter) {
                console.log("Intentando reconectar a:", myPrinter.name);
                const server = await myPrinter.gatt.connect();
                printCharacteristic = await getPrintCharacteristic(server);
                bluetoothDevice = myPrinter;
                console.log("✅ Impresora reconectada automáticamente");
            }
        } catch (e) {
            console.log("No se pudo reconectar auto:", e);
        }
    }
}

// Iniciar reconexión al cargar la página
window.addEventListener('load', () => {
    setTimeout(reconectarBluetoothAutomaticamente, 500);
});