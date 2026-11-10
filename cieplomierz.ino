#ifndef ZIGBEE_MODE_ED
#define ZIGBEE_MODE_ED
#endif

#include <Arduino.h>
#include <esp_cpu.h>
#include "Zigbee.h"

// --- Przypisanie wyprowadzeń ---
#define PIN_FLOW_SENSOR    4   // GPIO 4 - czujnik przepływu YF-S402
#define PIN_ONEWIRE        7   // GPIO 7 - magistrala 1-Wire dla T1 i T2

// --- Parametry czujnika YF-S402 ---
#define FLOW_CALIBRATION_FACTOR 4380.0f  // Impulsy / litr (F = 73 * Q)

// --- Konfiguracja Endpointów Zigbee ---
#define EP_TEMP_1          10  // Endpoint T1
#define EP_TEMP_2          11  // Endpoint T2
#define EP_FLOW            12  // Endpoint Przepływ

ZigbeeTempSensor zbTemp1 = ZigbeeTempSensor(EP_TEMP_1);
ZigbeeTempSensor zbTemp2 = ZigbeeTempSensor(EP_TEMP_2);
ZigbeeAnalog zbFlow = ZigbeeAnalog(EP_FLOW);

// --- Zmienne przepływomierza ---
volatile unsigned long pulseCounter = 0;

void IRAM_ATTR flowPulseIsr() {
    pulseCounter++;
}

// --- Precyzyjna obsługa 1-Wire dla rdzenia RISC-V (160 MHz) ---
static inline void delayCycles(uint32_t cycles) {
    uint32_t start = esp_cpu_get_cycle_count();
    while ((esp_cpu_get_cycle_count() - start) < cycles);
}

static inline void delayUs(uint32_t us) {
    delayCycles(us * 160);
}

static inline void driveLow(uint8_t pin) {
    digitalWrite(pin, LOW);
}

static inline void releaseLine(uint8_t pin) {
    digitalWrite(pin, HIGH);
}

static portMUX_TYPE dsMux = portMUX_INITIALIZER_UNLOCKED;

bool dsReset(uint8_t pin) {
    portENTER_CRITICAL(&dsMux);
    driveLow(pin);
    delayUs(480);
    releaseLine(pin);
    delayUs(70);

    int presence = digitalRead(pin);
    portEXIT_CRITICAL(&dsMux);

    delayUs(410);
    return (presence == LOW);
}

void dsWriteBit(uint8_t pin, uint8_t bit) {
    portENTER_CRITICAL(&dsMux);
    if (bit & 1) {
        driveLow(pin);
        delayCycles(960);      // 6 us
        releaseLine(pin);
        delayCycles(10240);    // 64 us
    } else {
        driveLow(pin);
        delayCycles(9600);     // 60 us
        releaseLine(pin);
        delayCycles(1600);     // 10 us
    }
    portEXIT_CRITICAL(&dsMux);
}

uint8_t dsReadBit(uint8_t pin) {
    portENTER_CRITICAL(&dsMux);
    driveLow(pin);
    delayCycles(480);          // 3 us
    releaseLine(pin);
    delayCycles(1600);         // 10 us

    uint8_t bit = digitalRead(pin) ? 1 : 0;
    portEXIT_CRITICAL(&dsMux);

    delayCycles(8480);         // 53 us
    return bit;
}

void dsWriteByte(uint8_t pin, uint8_t data) {
    for (uint8_t i = 0; i < 8; i++) {
        dsWriteBit(pin, data & 0x01);
        data >>= 1;
    }
}

uint8_t dsReadByte(uint8_t pin) {
    uint8_t result = 0;
    for (uint8_t i = 0; i < 8; i++) {
        if (dsReadBit(pin)) {
            result |= (1 << i);
        }
    }
    return result;
}

// Procedura wyszukiwania ROM
uint8_t sensorRom[2][8];
uint8_t devicesFound = 0;
int lastDiscrepancy = 0;
bool lastDeviceFlag = false;

bool dsSearch(uint8_t pin, uint8_t *newAddr) {
    int idBitNumber = 1;
    int lastZero = 0;
    int romByteNumber = 0;
    uint8_t romByteMask = 1;
    bool searchResult = false;

    if (!lastDeviceFlag) {
        if (!dsReset(pin)) {
            lastDiscrepancy = 0;
            return false;
        }

        dsWriteByte(pin, 0xF0); // SEARCH ROM

        while (idBitNumber <= 64) {
            uint8_t idBit = dsReadBit(pin);
            uint8_t cmpIdBit = dsReadBit(pin);

            if (idBit == 1 && cmpIdBit == 1) break;

            uint8_t searchDirection;
            if (idBit != cmpIdBit) {
                searchDirection = idBit;
            } else {
                if (idBitNumber < lastDiscrepancy) {
                    searchDirection = ((newAddr[romByteNumber] & romByteMask) > 0);
                } else {
                    searchDirection = (idBitNumber == lastDiscrepancy);
                }
                if (searchDirection == 0) lastZero = idBitNumber;
            }

            if (searchDirection == 1) {
                newAddr[romByteNumber] |= romByteMask;
            } else {
                newAddr[romByteNumber] &= ~romByteMask;
            }

            dsWriteBit(pin, searchDirection);

            idBitNumber++;
            romByteMask <<= 1;
            if (romByteMask == 0) {
                romByteNumber++;
                romByteMask = 1;
            }
        }

        if (idBitNumber > 64) {
            lastDiscrepancy = lastZero;
            if (lastDiscrepancy == 0) lastDeviceFlag = true;
            searchResult = true;
        }
    }

    if (!searchResult || !newAddr[0]) {
        lastDiscrepancy = 0;
        lastDeviceFlag = false;
        return false;
    }
    return true;
}

void dsStartAllConversion(uint8_t pin) {
    if (dsReset(pin)) {
        dsWriteByte(pin, 0xCC); // SKIP ROM
        dsWriteByte(pin, 0x44); // CONVERT T
    }
}

float dsReadTempByRom(uint8_t pin, const uint8_t *rom) {
    if (!dsReset(pin)) return -999.0f;

    dsWriteByte(pin, 0x55); // MATCH ROM
    for (uint8_t i = 0; i < 8; i++) {
        dsWriteByte(pin, rom[i]);
    }

    dsWriteByte(pin, 0xBE); // READ SCRATCHPAD

    uint8_t scratchpad[9];
    for (uint8_t i = 0; i < 9; i++) {
        scratchpad[i] = dsReadByte(pin);
    }
    dsReset(pin);

    if (scratchpad[0] == 0xFF && scratchpad[1] == 0xFF) return -999.0f;
    if (scratchpad[0] == 0x00 && scratchpad[1] == 0x00 && scratchpad[4] == 0x00) return -999.0f;

    int16_t raw = (scratchpad[1] << 8) | scratchpad[0];
    return (float)raw / 16.0f;
}

unsigned long lastMeasureTime = 0;

void setup() {
    Serial.begin(115200);
    unsigned long startWait = millis();
    while (!Serial && (millis() - startWait < 3000));

    Serial.println("\n--- Start systemu: Cieplomierz Zigbee ESP32-C6 ---");

    // 1. Sprzęt
    pinMode(PIN_FLOW_SENSOR, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(PIN_FLOW_SENSOR), flowPulseIsr, RISING);

    pinMode(PIN_ONEWIRE, OUTPUT_OPEN_DRAIN);
    releaseLine(PIN_ONEWIRE);

    // 2. Skanowanie 1-Wire
    uint8_t currentRom[8] = {0};
    while (dsSearch(PIN_ONEWIRE, currentRom) && devicesFound < 2) {
        memcpy(sensorRom[devicesFound], currentRom, 8);
        Serial.printf("Czujnik %d [ROM]: ", devicesFound + 1);
        for (uint8_t b = 0; b < 8; b++) {
            Serial.printf("%02X ", sensorRom[devicesFound][b]);
        }
        Serial.println();
        devicesFound++;
    }

    dsStartAllConversion(PIN_ONEWIRE);

    // 3. Konfiguracja stosu Zigbee
    Serial.println("[Zigbee] Inicjalizacja stosu i rejestracja endpointow...");
    
    zbTemp1.setManufacturerAndModel("DIY", "Cieplomierz-T1");
    zbTemp2.setManufacturerAndModel("DIY", "Cieplomierz-T2");
    zbFlow.setManufacturerAndModel("DIY", "Cieplomierz-Flow");

    Zigbee.addEndpoint(&zbTemp1);
    Zigbee.addEndpoint(&zbTemp2);
    Zigbee.addEndpoint(&zbFlow);

    // Rozpoczęcie parowania (End Device)
    if (!Zigbee.begin()) {
        Serial.println("[Zigbee] BLAD: Nie udalo sie zainicjalizowac stosu Zigbee!");
    } else {
        Serial.println("[Zigbee] Stos zainicjalizowany, rozpoczynam steering...");
    }

    lastMeasureTime = millis();
}

void loop() {
    unsigned long currentMillis = millis();

    if (currentMillis - lastMeasureTime >= 1000) {
        float dtSec = (currentMillis - lastMeasureTime) / 1000.0f;
        lastMeasureTime = currentMillis;

        // Odczyt impulsów
        noInterrupts();
        unsigned long pulses = pulseCounter;
        pulseCounter = 0;
        interrupts();

        float flowLPerMin = ((float)pulses / FLOW_CALIBRATION_FACTOR) / dtSec * 60.0f;

        // Odczyt temperatur
        float t1 = -999.0f;
        float t2 = -999.0f;

        if (devicesFound > 0) t1 = dsReadTempByRom(PIN_ONEWIRE, sensorRom[0]);
        if (devicesFound > 1) t2 = dsReadTempByRom(PIN_ONEWIRE, sensorRom[1]);

        dsStartAllConversion(PIN_ONEWIRE);

        // Wyświetlanie lokalne UART
        if (t1 > -100.0f) Serial.printf("T1: %5.2f °C", t1);
        else              Serial.print("T1:  BLAD   ");

        Serial.printf(" || Przepływ: %5.3f l/min", flowLPerMin);

        if (t2 > -100.0f) Serial.printf(" || T2: %5.2f °C", t2);
        else              Serial.print(" || T2:  BLAD   ");

        // Raportowanie danych przez sieć Zigbee (jeśli urządzenie dołączyło do koordynatora)
        if (Zigbee.connected()) {
            Serial.print(" || ZB: ONLINE\n");

            if (t1 > -100.0f) zbTemp1.setTemperature(t1);
            if (t2 > -100.0f) zbTemp2.setTemperature(t2);
            zbFlow.setAnalogInput(flowLPerMin);
        } else {
            Serial.print(" || ZB: JOINING\n");
        }
    }
}