# SPECYFIKACJA INTEGRACJI: Moduł Kontroli Dostępu PIN (ESP32-C6 <-> Raspberry Pi)

## 1. Architektura i Przepływ Danych (Data Flow)
* **Urządzenie brzegowe (ESP32-C6):** Działa jako bezstanowy *Zigbee End Device* (klient). Nie przechowuje bazy PIN-ów. Odczytuje z klawiatury matrycowej 4x4 ciąg cyfr (od 4 do 8 znaków), po czym po wciśnięciu klawisza `#` dzieli go i wysyła przez sieć ZigBee do koordynatora USB NOUS E16.
* **Warstwa Pośrednicząca (Zigbee2MQTT na Raspberry Pi):** Odbiera raporty ZCL, dekoduje je za pomocą zewnętrznego konwertera JavaScript i publikuje jako czysty JSON na brokerze MQTT Mosquitto (`zigbee2mqtt/access_1`).
* **Backend (Python FastAPI + PostgreSQL):** Subskrybuje temat MQTT, weryfikuje poprawność kodu PIN (np. testowy PIN administracyjny: `2137`) i odsyła decyzję zwrotną na temat sterujący (`zigbee2mqtt/access_1/set`).
* **Zbieg zdarzeń / Pętla zwrotna:** Zigbee2MQTT tłumaczy JSON-a z backendu na komendę ZCL i zapisuje ją w klastrze wykonawczym ESP32-C6, co natychmiast zmienia kolor wbudowanej diody RGB (Zielony = sukces, Czerwony = odmowa).

---

## 2. Kontrakt Komunikacyjny MQTT (`access_1`)

### A. Żądanie autoryzacji (ESP32-C6 -> Backend)
Gdy użytkownik wpisze PIN i zatwierdzi go klawiszem `#`, urządzenie wysyła przez trzy endpointy ZigBee spakowany payload, który Zigbee2MQTT konwertuje do następującego obiektu JSON publikowanego na temacie **`zigbee2mqtt/access_1`**:

```json
{
  "device_id": "access_1",
  "request_id": 1,
  "credential": "2137"
}
```
* **`device_id`** *(string)*: Friendly name urządzenia w Zigbee2MQTT (domyślnie `"access_1"`).
* **`request_id`** *(integer)*: Inkrementowany licznik próby (uint16_t, od 1 w górę). Służy do dopasowania odpowiedzi serwera do konkretnego żądania.
* **`credential`** *(string)*: Wpisany przez użytkownika kod PIN (wartość od 4 do 8 cyfr, zachowująca wiodące zera, np. `"0142"`). W celach testowych system ma obsługiwać m.in. PIN **`2137`**.

### B. Odpowiedź serwera (Backend -> ESP32-C6)
Backend (lub Ty w celach testowych) musi odesłać decyzję w postaci obiektu JSON na temat **`zigbee2mqtt/access_1/set`**:

```json
{
  "request_id": 1,
  "granted": true
}
```
* **`request_id`** *(integer)*: Musi dokładnie odpowiadać `request_id` odebranemu z żądania.
* **`granted`** *(boolean)*: `true` (dostęp przyznany – ESP32-C6 zaświeci wbudowaną diodę RGB na **ZIELONO** na 3 sekundy) lub `false` (dostęp odrzucony – dioda zaświeci na **CZERWONO** na 3 sekundy).

---

## 3. Specyfikacja Techniczna ZigBee (Dla konfiguracji Zigbee2MQTT)

Urządzenie ESP32-C6 rejestruje się w sieci ZigBee jako model `ESP32C6_PIN_PAD_V1` (producent: `AccessTech`) z obsługą **Multi-Endpoint** (3 endpointy oparte na standardowych klastrach ZCL `genAnalogInput` / `genAnalogOutput`):

| Endpoint ZCL | Klaster ZCL | Rola w transmisji danych |
|---|---|---|
| **Endpoint 1** | `genAnalogInput` / `genAnalogOutput` | Wysyła zakodowaną parę `(długość_pinu * 10000) + pierwsze_4_cyfry`. Posiada też kanał `Output` do odbioru decyzji serwera. |
| **Endpoint 2** | `genAnalogInput` | Wysyła cyfry od 5. do 8. (dla PIN-ów dłuższych niż 4 znaki). |
| **Endpoint 3** | `genAnalogInput` | Wysyła licznik **`request_id`**. Jego raport jest traktowany przez konwerter jako **wyzwalacz (commit trigger)** składający cały komunikat JSON. |

---

## 4. Gotowy Plik Konwertera Z2M dla Raspberry Pi (`access_1.js`)
Osoba zarządzająca Raspberry Pi musi umieścić poniższy kod w pliku `/opt/zigbee2mqtt/data/access_1.js` (lub w katalogu `external_converters`) i dopisać go do pliku `configuration.yaml` Zigbee2MQTT:

```javascript
const fz = require('zigbee-herdsman-converters/converters/fromZigbee');
const tz = require('zigbee-herdsman-converters/converters/toZigbee');
const exposes = require('zigbee-herdsman-converters/lib/exposes');
const reporting = require('zigbee-herdsman-converters/lib/reporting');
const e = exposes.presets;
const ea = exposes.access;

const fzLocal = {
    esp32c6_pin_auth_request: {
        cluster: 'genAnalogInput',
        type: ['attributeReport', 'readResponse'],
        convert: (model, msg, publish, options, meta) => {
            if (msg.data.presentValue === undefined) return;
            const epId = msg.endpoint.ID;
            const rawVal = Math.round(Number(msg.data.presentValue));

            if (!meta.device.meta) meta.device.meta = {};

            if (epId === 1) {
                meta.device.meta.pinHighEncoded = rawVal;
                return;
            }
            if (epId === 2) {
                meta.device.meta.pinLowEncoded = rawVal;
                return;
            }
            if (epId === 3) {
                const requestId = rawVal;
                if (requestId <= 0) return;

                const pinHighEncoded = meta.device.meta.pinHighEncoded || 0;
                const pinLowEncoded = meta.device.meta.pinLowEncoded || 0;

                const totalLen = Math.floor(pinHighEncoded / 10000);
                const first4Num = pinHighEncoded % 10000;

                let credential = String(first4Num).padStart(4, '0');
                if (totalLen > 4) {
                    const lowDigitsCount = totalLen - 4;
                    credential += String(pinLowEncoded).padStart(lowDigitsCount, '0');
                }

                const friendlyName = (options && options.friendly_name) ? options.friendly_name : meta.device.ieeeAddr;

                return {
                    device_id: friendlyName,
                    request_id: requestId,
                    credential: credential,
                };
            }
        },
    },
};

const tzLocal = {
    esp32c6_pin_auth_response: {
        key: ['granted', 'auth_response'],
        convertSet: async (entity, key, value, meta) => {
            const payload = (key === 'auth_response' && typeof value === 'object') ? value : meta.message;
            const requestId = Number(payload.request_id);
            const granted = Boolean(payload.granted);

            const encodedDecision = granted ? Math.abs(requestId) : -Math.abs(requestId);
            const ep1 = meta.device.getEndpoint(1);

            await ep1.write('genAnalogOutput', { presentValue: encodedDecision });

            return {
                state: {
                    last_response_request_id: requestId,
                    granted: granted,
                },
            };
        },
    },
};

const definition = {
    zigbeeModel: ['ESP32C6_PIN_PAD_V1'],
    model: 'ESP32C6_PIN_PAD_V1',
    vendor: 'AccessTech',
    description: 'ESP32-C6 PIN Access Control Module',
    fromZigbee: [fzLocal.esp32c6_pin_auth_request],
    toZigbee: [tzLocal.esp32c6_pin_auth_response],
    exposes: [
        e.text('device_id', ea.STATE),
        e.numeric('request_id', ea.STATE_SET),
        e.text('credential', ea.STATE),
        e.binary('granted', ea.STATE_SET, true, false),
    ],
    meta: { multiEndpoint: true },
    endpoint: (device) => ({ ep1: 1, ep2: 2, ep3: 3 }),
    configure: async (device, coordinatorEndpoint, logger) => {
        for (const epNum of [1, 2, 3]) {
            const ep = device.getEndpoint(epNum);
            if (ep) await reporting.bind(ep, coordinatorEndpoint, ['genAnalogInput']);
        }
        const ep1 = device.getEndpoint(1);
        if (ep1) await reporting.bind(ep1, coordinatorEndpoint, ['genAnalogOutput']);
    },
};

module.exports = definition;
```

---

## 5. Instrukcja szybkiego testu ręcznego (Bez gotowego backendu Python)
Osoba na Raspberry Pi może w każdej chwili zasymulować odpowiedź serwera z poziomu terminala systemowego za pomocą komendy `mosquitto_pub`:

1. Wpisz na klawiaturze ESP32-C6 kod **`2137`** i naciśnij `#` (dioda RGB zacznie pulsować na **biało** – oczekiwanie na `request_id: 1`).
2. Wyślij z terminala Raspberry Pi komendę aktywującą **zieloną diodę** (poprawny PIN):
   ```bash
   mosquitto_pub -h localhost -t "zigbee2mqtt/access_1/set" -m '{"request_id": 1, "granted": true}'
   ```
3. Wyślij komendę aktywującą **czerwoną diodę** (błędny PIN, np. dla próby `request_id: 2`):
   ```bash
   mosquitto_pub -h localhost -t "zigbee2mqtt/access_1/set" -m '{"request_id": 2, "granted": false}'
   ```