/**
 * Moduł kontroli dostępu PIN (ESP32-C6 + ZigBee 3.0 End Device)
 *
 * - Sygnalizacja wyłącznie na wbudowanej diodzie adresowalnej RGB WS2812 (GPIO8):
 *     * BIAŁY (ciągły)   -> Czeka na kod PIN (z krótkim mignięciem przy naciśnięciu klawisza)
 *     * BIAŁY (pulsuje)  -> Wysłano PIN, oczekiwanie na decyzję z serwera
 *     * ZIELONY (3 s)    -> Kod poprawny (dostęp przyznany)
 *     * CZERWONY (3 s)   -> Zły kod (dostęp odrzucony)
 *     * CZERWONY (3x)    -> Timeout / zbyt krótki PIN / brak sieci ZigBee
 */

#ifndef ZIGBEE_MODE_ED
#error "Tryb Zigbee End Device nie jest wlaczony! Wybierz w menu Tools -> Zigbee Mode: Zigbee ED (end device)"
#endif

#include <Arduino.h>
#include <Zigbee.h>
#include <Keypad.h>
#include <math.h>

// ============================================================================
// 1. DEFINICJE PINÓW GPIO (ESP32-C6-DevKitC-1 V1.2)
// ============================================================================

constexpr uint8_t PIN_BOOT_BTN = 9; 
constexpr uint8_t LED_BRIGHTNESS = 35;

constexpr byte KEYPAD_ROWS = 4;
constexpr byte KEYPAD_COLS = 4;

char keymap[KEYPAD_ROWS][KEYPAD_COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};

// RX: [15, 23, 22, 21, 20, 19, 18, 9]
byte rowPins[KEYPAD_ROWS] = {15, 23, 22, 21}; // R1, R2, R3, R4
byte colPins[KEYPAD_COLS] = {20, 19, 18, 9};  // C1, C2, C3, C4

Keypad keypad = Keypad(makeKeymap(keymap), rowPins, colPins, KEYPAD_ROWS, KEYPAD_COLS);

// ============================================================================
// 2. KONFIGURACJA CZASOWA I PARAMETRY BUFORA PIN
// ============================================================================
constexpr size_t   PIN_MIN_LEN                = 4;
constexpr size_t   PIN_MAX_LEN                = 8;
constexpr uint32_t PIN_ENTRY_TIMEOUT_MS       = 10000; // 10 s bezczynności czyści bufor PIN
constexpr uint32_t SERVER_RESPONSE_TIMEOUT_MS = 5000;  // 5 s oczekiwania na odpowiedź backendu
constexpr uint32_t RESULT_LED_HOLD_MS         = 3000;  // 3 s świecenia diody zielonej/czerwonej
constexpr uint32_t ERROR_BLINK_INTERVAL_MS    = 150;   // Czas pojedynczej fazy mignięcia błędu
constexpr uint32_t WAITING_PULSE_INTERVAL_MS  = 200;   // Okres pulsowania w oczekiwaniu na serwer
constexpr uint32_t KEY_FEEDBACK_BLINK_MS      = 60;    // Krótkie przygaszenie białej diody przy klawiszu
constexpr uint32_t FACTORY_RESET_HOLD_MS      = 3000;  // 3 s przytrzymania BOOT do resetu ZigBee

// ============================================================================
// 3. ENDPOINTY ZIGBEE (ZCL genAnalogInput 0x000C / genAnalogOutput 0x000D)
// ============================================================================
constexpr uint8_t ZB_EP_PIN_HIGH_AND_DECISION = 1;
constexpr uint8_t ZB_EP_PIN_LOW               = 2;
constexpr uint8_t ZB_EP_REQ_ID                = 3;

ZigbeeAnalog zbEpPinHigh(ZB_EP_PIN_HIGH_AND_DECISION);
ZigbeeAnalog zbEpPinLow(ZB_EP_PIN_LOW);
ZigbeeAnalog zbEpReqId(ZB_EP_REQ_ID);

const char* ZB_MANUFACTURER_NAME = "AccessTech";
const char* ZB_MODEL_ID          = "ESP32C6_PIN_PAD_V1";

// ============================================================================
// 4. MASZYNA STANÓW I SYNCHRONIZACJA MIĘDZYWĄTKOWA
// ============================================================================
enum class SystemState : uint8_t {
  IDLE,
  ENTERING_PIN,
  WAITING_FOR_SERVER,
  SHOWING_RESULT
};

enum class ResultMode : uint8_t {
  NONE,
  ACCESS_GRANTED,   // Zielona LED przez 3 s
  ACCESS_DENIED,    // Czerwona LED przez 3 s
  ERROR_TRIPLE_RED  // 3 szybkie mignięcia czerwoną LED
};

SystemState currentState  = SystemState::IDLE;
ResultMode  currentResult = ResultMode::NONE;

char     pinBuffer[PIN_MAX_LEN + 1] = {0};
size_t   pinLength       = 0;
uint16_t requestCounter  = 0;
uint16_t activeRequestId = 0;

// Timery nieblokujące oparte na millis()
uint32_t stateTimestampMs    = 0;
uint32_t lastKeyActivityMs   = 0;
uint32_t keyBlinkStartMs     = 0;
bool     keyBlinkActive      = false;
uint32_t waitingPulseTimerMs = 0;
bool     waitingLedLevel     = false;
uint8_t  errorBlinkStep      = 0;
uint32_t errorBlinkTimerMs   = 0;

// Obsługa nieblokująca przycisku BOOT
bool     bootBtnPressed      = false;
uint32_t bootBtnPressStartMs = 0;

// Zmienne współdzielone z callbackiem stosu ZigBee (wątek FreeRTOS)
portMUX_TYPE zbSpinlock = portMUX_INITIALIZER_UNLOCKED;
volatile bool     zbResponsePending = false;
volatile uint16_t zbResponseReqId   = 0;
volatile bool     zbResponseGranted = false;

// ============================================================================
// 5. STEROWANIE WBUDOWANĄ DIODĄ RGB WS2812 (GPIO8)
// ============================================================================
void setRgbColor(uint8_t r, uint8_t g, uint8_t b) {
  rgbLedWrite(PIN_RGB_LED, r, g, b);
}

void ledShowWhiteWaitingForCode() {
  setRgbColor(LED_BRIGHTNESS, LED_BRIGHTNESS, LED_BRIGHTNESS);
}

void ledShowGreenGranted() {
  setRgbColor(0, LED_BRIGHTNESS * 2, 0);
}

void ledShowRedDenied() {
  setRgbColor(LED_BRIGHTNESS * 2, 0, 0);
}

void ledShowOff() {
  setRgbColor(0, 0, 0);
}

// Krótkie mignięcie (zgaszenie białej diody na 60 ms) przy naciśnięciu klawisza
void triggerKeyFeedbackBlink() {
  keyBlinkActive = true;
  keyBlinkStartMs = millis();
  ledShowOff();
}

void clearPinBuffer() {
  memset(pinBuffer, 0, sizeof(pinBuffer));
  pinLength = 0;
}

void enterShowingResult(ResultMode mode) {
  currentState = SystemState::SHOWING_RESULT;
  currentResult = mode;
  stateTimestampMs = millis();
  keyBlinkActive = false;

  if (mode == ResultMode::ACCESS_GRANTED) {
    Serial.println("[RGB-LED] Dostep PRZYZNANY -> Kolor ZIELONY (3 s)");
    ledShowGreenGranted();
  } else if (mode == ResultMode::ACCESS_DENIED) {
    Serial.println("[RGB-LED] Dostep ODRZUCONY -> Kolor CZERWONY (3 s)");
    ledShowRedDenied();
  } else if (mode == ResultMode::ERROR_TRIPLE_RED) {
    Serial.println("[RGB-LED] Blad / Timeout -> Kolor CZERWONY (3x szybki blysk)");
    errorBlinkStep = 0;
    errorBlinkTimerMs = millis();
    ledShowRedDenied();
  }
}

// ============================================================================
// 6. CALLBACK ODBIORU DECYZJI Z SIECI ZIGBEE (WĄTEK STOSU ZIGBEE)
// ============================================================================
void onDecisionReceivedCallback(float encodedDecision) {
  int32_t roundedVal = (int32_t)lroundf(encodedDecision);
  if (roundedVal == 0) {
    return;
  }

  uint16_t receivedReqId = (uint16_t)abs(roundedVal);
  bool granted = (roundedVal > 0);

  portENTER_CRITICAL(&zbSpinlock);
  zbResponseReqId   = receivedReqId;
  zbResponseGranted = granted;
  zbResponsePending = true;
  portEXIT_CRITICAL(&zbSpinlock);
}

// ============================================================================
// 7. KODOWANIE I WYSYŁANIE ŻĄDANIA AUTORYZACJI PRZEZ ZIGBEE
// ============================================================================
void sendZigbeeAuthRequest(const char* pin, size_t len) {
  if (!Zigbee.connected()) {
    Serial.println("[ZIGBEE-ERR] Brak polaczenia z siecia ZigBee! Odrzucam probe.");
    clearPinBuffer();
    enterShowingResult(ResultMode::ERROR_TRIPLE_RED);
    return;
  }

  requestCounter++;
  if (requestCounter == 0) {
    requestCounter = 1;
  }
  activeRequestId = requestCounter;

  // Rozbicie PIN-u (4..8 cyfr) na dwie części 4-cyfrowe bez utraty wiodących zer
  char highBuf[5] = {0};
  strncpy(highBuf, pin, 4);
  uint32_t first4Digits = (uint32_t)strtoul(highBuf, nullptr, 10);
  uint32_t pinHighEncoded = ((uint32_t)len * 10000UL) + first4Digits;

  uint32_t pinLowEncoded = 0;
  if (len > 4) {
    char lowBuf[5] = {0};
    strncpy(lowBuf, pin + 4, len - 4);
    pinLowEncoded = (uint32_t)strtoul(lowBuf, nullptr, 10);
  }

  Serial.println("------------------------------------------------------------");
  Serial.printf("[AUTH-REQ] Wysylanie zadania ZigBee:\r\n");
  Serial.printf("  -> request_id : %u\r\n", activeRequestId);
  Serial.printf("  -> credential : \"%s\" (dlugosc: %u)\r\n", pin, (unsigned)len);
  Serial.printf("  -> ZCL EP1 (pin_high): %lu | EP2 (pin_low): %lu | EP3 (req_id): %u\r\n",
                (unsigned long)pinHighEncoded, (unsigned long)pinLowEncoded, activeRequestId);
  Serial.println("------------------------------------------------------------");

  zbEpPinHigh.setAnalogInput((float)pinHighEncoded);
  zbEpPinHigh.reportAnalogInput();

  zbEpPinLow.setAnalogInput((float)pinLowEncoded);
  zbEpPinLow.reportAnalogInput();

  zbEpReqId.setAnalogInput((float)activeRequestId);
  zbEpReqId.reportAnalogInput();

  clearPinBuffer();

  currentState        = SystemState::WAITING_FOR_SERVER;
  stateTimestampMs    = millis();
  waitingPulseTimerMs = millis();
  waitingLedLevel     = true;
  ledShowWhiteWaitingForCode();
}

// ============================================================================
// 8. OBSŁUGA KLAWIATURY MATRYCOWEJ 4x4
// ============================================================================
void processKeyInput(char key) {
  if (key == NO_KEY) {
    return;
  }

  if (currentState == SystemState::WAITING_FOR_SERVER) {
    Serial.printf("[KEYPAD] Zignorowano klawisz '%c' (trwa oczekiwanie na decyzje serwera)\r\n", key);
    return;
  }

  if (currentState == SystemState::SHOWING_RESULT) {
    currentState = SystemState::IDLE;
    ledShowWhiteWaitingForCode();
  }

  triggerKeyFeedbackBlink();
  lastKeyActivityMs = millis();

  if (key >= '0' && key <= '9') {
    if (currentState == SystemState::IDLE) {
      currentState = SystemState::ENTERING_PIN;
    }

    if (pinLength < PIN_MAX_LEN) {
      pinBuffer[pinLength++] = key;
      pinBuffer[pinLength] = '\0';
      Serial.printf("[KEYPAD] Wpisano cyfre '%c' | Bufor (%u/%u): %s\r\n",
                    key, (unsigned)pinLength, (unsigned)PIN_MAX_LEN, pinBuffer);
    } else {
      Serial.println("[KEYPAD] Osiagnieto maksymalna dlugosc PIN-u (8 cyfr)! Nacisnij '#' lub '*'.");
    }
  } else if (key == '*') {
    clearPinBuffer();
    currentState = SystemState::IDLE;
    Serial.println("[KEYPAD] Nacisnieto '*' -> Bufor PIN wyczyszczony, powrot do IDLE (BIALY).");
  } else if (key == '#') {
    if (pinLength >= PIN_MIN_LEN && pinLength <= PIN_MAX_LEN) {
      Serial.printf("[KEYPAD] Nacisnieto '#' -> Zatwierdzono PIN (%u cyfr).\r\n", (unsigned)pinLength);
      sendZigbeeAuthRequest(pinBuffer, pinLength);
    } else {
      Serial.printf("[KEYPAD-ERR] Zbyt krotki PIN (%u cyfr, wymagane min. %u)! Czyszcze bufor.\r\n",
                    (unsigned)pinLength, (unsigned)PIN_MIN_LEN);
      clearPinBuffer();
      enterShowingResult(ResultMode::ERROR_TRIPLE_RED);
    }
  } else {
    Serial.printf("[KEYPAD] Klawisz funkcyjny '%c' nieuzywany.\r\n", key);
  }
}

// ============================================================================
// 9. NIEBLOKUJĄCA AKTUALIZACJA MASZYNY STANÓW I PRZYCISKU BOOT
// ============================================================================
void updateStateMachine() {
  uint32_t now = millis();

  // Przywrócenie białego światła po krótkim mignięciu klawisza (60 ms)
  if (keyBlinkActive && (now - keyBlinkStartMs >= KEY_FEEDBACK_BLINK_MS)) {
    keyBlinkActive = false;
    if (currentState == SystemState::IDLE || currentState == SystemState::ENTERING_PIN) {
      ledShowWhiteWaitingForCode();
    }
  }

  // Sprawdzenie odpowiedzi z wątku ZigBee
  bool hasResponse = false;
  uint16_t respId = 0;
  bool respGranted = false;

  portENTER_CRITICAL(&zbSpinlock);
  if (zbResponsePending) {
    hasResponse       = true;
    respId            = zbResponseReqId;
    respGranted       = zbResponseGranted;
    zbResponsePending = false;
  }
  portEXIT_CRITICAL(&zbSpinlock);

  if (hasResponse) {
    Serial.printf("[ZIGBEE-RX] Odebrano decyzje z koordynatora: request_id=%u, granted=%s\r\n",
                  respId, respGranted ? "true" : "false");

    if (currentState == SystemState::WAITING_FOR_SERVER && respId == activeRequestId) {
      enterShowingResult(respGranted ? ResultMode::ACCESS_GRANTED : ResultMode::ACCESS_DENIED);
    } else {
      Serial.printf("[ZIGBEE-WARN] Odrzucono odpowiedz (aktualny stan=%u, oczekiwane request_id=%u)\r\n",
                    (uint8_t)currentState, activeRequestId);
    }
  }

  switch (currentState) {
    case SystemState::IDLE:
      break;

    case SystemState::ENTERING_PIN:
      if (now - lastKeyActivityMs >= PIN_ENTRY_TIMEOUT_MS) {
        Serial.println("[TIMEOUT] Przekroczono 10 s bezczynnosci podczas wpisywania PIN-u! Reset bufora.");
        clearPinBuffer();
        enterShowingResult(ResultMode::ERROR_TRIPLE_RED);
      }
      break;

    case SystemState::WAITING_FOR_SERVER:
      // Pulsowanie białego koloru podczas oczekiwania na odpowiedź serwera
      if (now - waitingPulseTimerMs >= WAITING_PULSE_INTERVAL_MS) {
        waitingPulseTimerMs = now;
        waitingLedLevel = !waitingLedLevel;
        if (waitingLedLevel) {
          ledShowWhiteWaitingForCode();
        } else {
          ledShowOff();
        }
      }

      if (now - stateTimestampMs >= SERVER_RESPONSE_TIMEOUT_MS) {
        Serial.printf("[TIMEOUT] Brak odpowiedzi serwera dla request_id=%u w ciagu 5 s!\r\n", activeRequestId);
        enterShowingResult(ResultMode::ERROR_TRIPLE_RED);
      }
      break;

    case SystemState::SHOWING_RESULT:
      if (currentResult == ResultMode::ACCESS_GRANTED || currentResult == ResultMode::ACCESS_DENIED) {
        if (now - stateTimestampMs >= RESULT_LED_HOLD_MS) {
          currentResult = ResultMode::NONE;
          currentState = SystemState::IDLE;
          ledShowWhiteWaitingForCode();
          Serial.println("[STATE] Koniec sygnalizacji -> Powrot do stanu IDLE (BIALY).");
        }
      } else if (currentResult == ResultMode::ERROR_TRIPLE_RED) {
        if (now - errorBlinkTimerMs >= ERROR_BLINK_INTERVAL_MS) {
          errorBlinkTimerMs = now;
          errorBlinkStep++;
          if (errorBlinkStep < 6) {
            if (errorBlinkStep % 2 == 0) {
              ledShowRedDenied();
            } else {
              ledShowOff();
            }
          } else {
            currentResult = ResultMode::NONE;
            currentState = SystemState::IDLE;
            ledShowWhiteWaitingForCode();
            Serial.println("[STATE] Koniec sygnalizacji bledu -> Powrot do stanu IDLE (BIALY).");
          }
        }
      }
      break;
  }
}

void handleBootButtonFactoryReset() {
  // Sprawdzamy przycisk BOOT tylko w stanie IDLE, gdy żaden klawisz nie jest aktywnie skanowany
  if (currentState != SystemState::IDLE) {
    bootBtnPressed = false;
    return;
  }

  pinMode(PIN_BOOT_BTN, INPUT_PULLUP);
  bool isLow = (digitalRead(PIN_BOOT_BTN) == LOW);
  uint32_t now = millis();

  if (isLow && !bootBtnPressed) {
    bootBtnPressed = true;
    bootBtnPressStartMs = now;
  } else if (isLow && bootBtnPressed) {
    if (now - bootBtnPressStartMs >= FACTORY_RESET_HOLD_MS) {
      Serial.println("[BOOT] Przytrzymano przycisk BOOT > 3 s! Wykonywanie Zigbee.factoryReset()...");
      setRgbColor(0, 0, LED_BRIGHTNESS * 2); // Niebieski na czas resetu
      Zigbee.factoryReset();
    }
  } else if (!isLow && bootBtnPressed) {
    bootBtnPressed = false;
  }
}

// ============================================================================
// 10. SETUP & LOOP
// ============================================================================
void setup() {
  Serial.begin(115200);
  keypad.setDebounceTime(25);

  // Od razu na starcie zapalamy białą diodę (gotowość do wpisania kodu)
  ledShowWhiteWaitingForCode();

  Serial.println("\r\n============================================================");
  Serial.println("  ESP32-C6 ZIGBEE 3.0 PIN ACCESS MODULE (WBUDOWany RGB LED)");
  Serial.println("============================================================");

  // Konfiguracja Endpointu 1 (AnalogInput: PIN High + AnalogOutput: Decyzja z serwera)
  zbEpPinHigh.setManufacturerAndModel(ZB_MANUFACTURER_NAME, ZB_MODEL_ID);
  zbEpPinHigh.addAnalogInput();
  zbEpPinHigh.setAnalogInputDescription("PIN_Length_And_High4");
  zbEpPinHigh.setAnalogInputResolution(1.0f);

  zbEpPinHigh.addAnalogOutput();
  zbEpPinHigh.setAnalogOutputDescription("Server_Auth_Decision");
  zbEpPinHigh.setAnalogOutputResolution(1.0f);
  zbEpPinHigh.setAnalogOutputMinMax(-65535.0f, 65535.0f);
  zbEpPinHigh.onAnalogOutputChange(onDecisionReceivedCallback);

  // Konfiguracja Endpointu 2 (AnalogInput: PIN Low)
  zbEpPinLow.setManufacturerAndModel(ZB_MANUFACTURER_NAME, ZB_MODEL_ID);
  zbEpPinLow.addAnalogInput();
  zbEpPinLow.setAnalogInputDescription("PIN_Low4");
  zbEpPinLow.setAnalogInputResolution(1.0f);

  // Konfiguracja Endpointu 3 (AnalogInput: Request ID / Commit Trigger)
  zbEpReqId.setManufacturerAndModel(ZB_MANUFACTURER_NAME, ZB_MODEL_ID);
  zbEpReqId.addAnalogInput();
  zbEpReqId.setAnalogInputDescription("Request_ID");
  zbEpReqId.setAnalogInputResolution(1.0f);

  // Rejestracja endpointów w rdzeniu Zigbee
  Zigbee.addEndpoint(&zbEpPinHigh);
  Zigbee.addEndpoint(&zbEpPinLow);
  Zigbee.addEndpoint(&zbEpReqId);

  Serial.println("[ZIGBEE] Uruchamianie stosu ZigBee End Device...");
  if (!Zigbee.begin(ZIGBEE_END_DEVICE)) {
    Serial.println("[ZIGBEE-FATAL] Blad inicjalizacji stosu ZigBee! Restart...");
    ESP.restart();
  }

  Serial.println("[ZIGBEE] Stos uruchomiony. Dioda RGB swieci na BIALO (oczekiwanie na kod PIN).");
}

void loop() {
  char key = keypad.getKey();
  processKeyInput(key);
  updateStateMachine();
  handleBootButtonFactoryReset();
}