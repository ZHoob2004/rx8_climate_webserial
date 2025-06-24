let port;
let writer;
let reader;
let textDecoder = new TextDecoder();
let readLoop;

const commandMap = {
    tempUp: [0x04, 0x80, 0x80, 0x81, 0xFB],
    tempDown: [0x04, 0x80, 0x80, 0x87, 0xF5],
    fanUp: [0x04, 0x80, 0x80, 0x90, 0xEC],
    fanDown: [0x04, 0x80, 0x80, 0xF0, 0x8C],
    auto: [0x04, 0x82, 0x80, 0x80, 0xFA],
    off: [0x04, 0x81, 0x80, 0x80, 0xFB],
    mode: [0x04, 0x90, 0x80, 0x80, 0xEC],
    ac: [0x04, 0x84, 0x80, 0x80, 0xF8],
    frontDefrost: [0x04, 0xA0, 0x80, 0x80, 0xDC],
    rearDefrost: [0x04, 0xC0, 0x80, 0x80, 0xBC],
    recirculate: [0x04, 0x88, 0x80, 0x80, 0xF4],
    testAuto: [0x0D, 0xE1, 0xE8, 0x90, 0xE9, 0xB2],
    testManual: [0x0D, 0xE1, 0xE8, 0xD0, 0xE8, 0xF2],
    testOff: [0x0F, 0xFF, 0xFF, 0xFF, 0xE0, 0x94],
    testAmbient: [0x0E, 0xDD, 0xFD, 0xFD, 0xE0, 0xBB]
};

async function connectSerial() {
    try {
        port = await navigator.serial.requestPort();
        await port.open({ baudRate: 4800, dataBits: 8, stopBits: 1, parity: 'even', flowControl: 'none' });

        writer = port.writable.getWriter();
        reader = port.readable.getReader();

        document.getElementById("status").innerText = "Connected";

        readLoop = readSerial();
    } catch (err) {
        console.error("Serial connection error:", err);
        document.getElementById("status").innerText = "Connection failed";
    }
}

async function sendCommand(action) {
    if (!writer || !commandMap[action]) return;

    const bytes = new Uint8Array(commandMap[action]);
    await writer.write(bytes);
    console.log(`Sent: ${bytes}`);
}

/*async function readSerial() {
    let buffer = [];

    while (true) {
        try {
            const { value, done } = await reader.read();
            if (done) break;
            for (let byte of value) {
                buffer.push(byte);
                if (buffer.length >= 6) {
                    console.log(`Recv: ${buffer}`);
                    parseStatus(buffer.slice(0, 6));
                    buffer = [];
                }
            }
        } catch (err) {
            console.error("Read error:", err);
            break;
        }
    }
}*/

async function readSerial() {
    let buffer = [];
    let packetTimer = null;

    function resetTimer() {
        if (packetTimer) clearTimeout(packetTimer);
        packetTimer = setTimeout(() => {
            // Fallback in case bytes stop before 6-byte packet is reached
            if (buffer.length > 0) {
                console.log(`Recv (incomplete, timeout): ${buffer}`);
                buffer = []; // Discard partial packet
            }
        }, 10); // Slightly longer than inter-frame gap, allows full packet to arrive
    }

    while (true) {
        try {
            const { value, done } = await reader.read();
            if (done) break;
            for (let byte of value) {
                buffer.push(byte);
                resetTimer();

                if (buffer.length === 6) {
                    clearTimeout(packetTimer);
                    console.log(`Recv (6 bytes): ${buffer}`);
                    parseStatus(buffer.slice());
                    buffer = [];
                } else if (buffer.length > 6) {
                    // Extra safety in case of misaligned start
                    console.warn("Buffer overrun, resyncing...");
                    buffer = [];
                    clearTimeout(packetTimer);
                }
            }
        } catch (err) {
            console.error("Read error:", err);
            break;
        }
    }
}


function parseStatus(bytes) {

    let mode = "";
    if ((bytes[3] >> 6) & 1) {
        mode = "Manual"
    } else {
        mode = "Auto"
    }

    // Mode icons encoded in byte 4 bits 0 and 1
    // Mode 0 = feet, 1 = feet\demist, 2 = face, 3 = face\feet
    // Testing gives backwards results, is this a big/little endian thing?
    let pos = "";
    switch (bytes[4] & 0x3) {
        case 0:
            pos = "Feet";
            break;
        case 1:
            //pos = "Feet/Defrost";
            pos = "Face"
            break;
        case 2:
            //pos = "Face";
            pos = "Feet/Defrost";
            break;
        case 3:
            pos = "Face/Feet";
            break;
    }

    let ac = "";
    if ((bytes[3] >> 5) & 1) {
        ac = "Off";
    } else {
        ac = "On";
    }

    let frontDefrost = "";
    if ((bytes[4] >> 6) & 1) {
        frontDefrost = "Off";
    } else {
        frontDefrost = "On";
    }

    let rearDefrost = "";
    if ((bytes[4] >> 5) & 1) {
        rearDefrost = "Off";
    } else {
        rearDefrost = "On";
    }

    let airSource = "";
    if ((bytes[4] >> 3) & 1) {
        airSource = "Recirculate";
    } else {
        airSource = "Fresh"
    }

    let temp1 = bytes[1] & 0xF;
    let temp2 = bytes[2] & 0xF;
    let temp3 = bytes[3] & 0xF;

    let fanSpeed = (bytes[2] >> 4) & 7;
    if (fanSpeed > 6) {
        fanSpeed = 0;
    }

    const displayMode = `Mode: ${mode}`;
    const displayPos = `Position: ${pos}`;
    const displayAC = `A/C: ${ac}`;
    const displayFrontDefrost = `Front Defrost: ${frontDefrost}`;
    const displayRearDefrost = `Rear Defrost: ${rearDefrost}`;
    const displayAir = `Air: ${airSource}`;
    const displayTemp = `Temp: ${temp1.toString(16).toUpperCase()}${temp2.toString(16).toUpperCase()}.${temp3.toString(16).toUpperCase()}°C`;
    const displayFan = `Fan: ${fanSpeed}`;

    document.getElementById("mode").innerText = displayMode;
    document.getElementById("pos").innerText = displayPos;
    document.getElementById("ac").innerText = displayAC;
    document.getElementById("frontDefrost").innerText = displayFrontDefrost;
    document.getElementById("rearDefrost").innerText = displayRearDefrost;
    document.getElementById("air").innerText = displayAir;
    document.getElementById("temp").innerText = displayTemp;
    document.getElementById("fan").innerText = displayFan;
}