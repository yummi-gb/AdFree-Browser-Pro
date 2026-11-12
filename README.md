# 🛡️ AdFree Browser Pro (v1.1.5) – Samsung Tizen Smart TV Browser

Ein schneller, 100 % werbefreier Webbrowser speziell für **Samsung Smart TVs (Tizen OS)** mit freier TV-Maussteuerung über das Steuerkreuz der Fernbedienung, Multi-Tab-Unterstützung, Favoriten, Verlauf, integriertem Adblocker und direktem HLS/MP4-Video-Extractor im Chrome-Vollbildmodus.

---

## ✨ Features

- **🛡️ 100 % Werbefrei (AdBlock Engine):** Blockiert Werbebanner, Popups, Tracker und Cookie-Banner direkt auf DOM- und Netzwerk-Ebene.
- **🖱️ Präzise TV-Maussteuerung:** Freier Mauszeiger auf allen Webseiten, Tabs und Menüs – gesteuert direkt über das Steuerkreuz der Samsung-Fernbedienung (inkl. automatischem Rand-Scrollen).
- **🎬 Integrierter Direkt-Stream & HLS Video-Player:**
  - Automatische Entschlüsselung von eingebetteten Video-Streams (u. a. VOE Deutsch/Englisch inkl. automatischer ALTCHA-Gate-Auflösung).
  - Lokale `hls.min.js`-Integration für flüssige HD-Wiedergabe direkt im nativen HTML5-Player ohne Werbe-Overlays.
- **⛶ Echter Vollbildmodus (wie Google Chrome):**
  - **Video-Vollbild:** 100 % Rand-zu-Rand (1920×1080) ohne sichtbare Browser- oder Webseiten-Leisten; die Steuerleiste und der Mauszeiger blenden sich nach 2,5 Sekunden Inaktivität automatisch komplett aus.
  - **Browser-Vollbild:** Blendet Tab- und Navigationsleiste komplett aus; bewegt man den Mauszeiger an den oberen Bildschirmrand, klappen die Leisten wie bei Chrome automatisch wieder ein.
- **📑 Multi-Tab, Favoriten ⭐ & Verlauf 🕒:** Beliebig viele Tabs öffnen, eigene Favoriten speichern und den Verlauf verwalten.
- **📰 Kicker Live-Sportportal & Google-Login-Unterstützung:** Integrierter lokaler Tizen-Hintergrunddienst (`service.js`) für Header-/Cookie-Normalisierung und direkte Sport-Newsfeeds.

---

## 🎮 Fernbedienungs-Steuerung

| Taste | Funktion |
| :--- | :--- |
| **Steuerkreuz (▲ ▼ ◀ ▶)** | Mauszeiger bewegen / im Vollbild spulen (◀ -15s / ▶ +15s) |
| **OK (Auswahl)** | Element unter dem Mauszeiger anklicken / im Video-Vollbild Play & Pause |
| **Zurück (Return)** | Vollbild beenden / eine Seite zurück |
| **CH ⬆ / CH ⬇** | Webseite schnell nach oben / unten scrollen |
| **🔴 Rote Taste** | Vollbild umschalten (Video-Vollbild bzw. Chrome-Browser-Vollbild) |
| **🟢 Grüne Taste** | Neuen Tab öffnen |
| **🟡 Gelbe Taste** | Bildschirm-Tastatur / URL-Eingabe öffnen |
| **🔵 Blaue Taste** | Favoriten & Verlauf öffnen |

---

## 📦 Projektstruktur

- [`config.xml`](./config.xml) – Tizen Web Application & Background Service Manifest (`AdFreeBrws.AdFreeBrowser` + `AdFreeBrws.ProxyService`)
- [`index.html`](./index.html) – Hauptanwendung (UI, AdBlocker, Direct-DOM-Renderer, TV-Maussteuerung, Vollbild-Player)
- [`service.js`](./service.js) – Lokaler Tizen Node.js Hintergrund-Proxy & Stream-Extractor (VOE / ALTCHA / Google Auth)
- [`hls.min.js`](./hls.min.js) – Gebündelte HLS.js-Bibliothek für adaptive `.m3u8` Video-Streams
- [`icon.png`](./icon.png) – App-Icon für das Samsung TV Smart Hub Menü

---

## 🚀 Installation auf dem Samsung Smart TV

1. **Entwicklermodus auf dem TV aktivieren:**
   - Öffne auf dem Samsung TV die App **Apps**.
   - Tippe über die Fernbedienung **`12345`** ein.
   - Schalte den **Developer Mode** auf **On**, trage die IP-Adresse deines PCs ein und starte den TV neu.
2. **Paket packen, signieren & installieren:**
   - Verbinde dich per Tizen SDB mit dem Fernseher:
     ```bash
     sdb connect <TV-IP>:26101
     ```
   - Packe und signiere das Projektverzeichnis als `.wgt`-Paket mit deinem Tizen-Zertifikat (z. B. über Tizen Studio CLI `tizen package -t wgt` oder `TizenSdb`) und installiere es:
     ```bash
     sdb install AdFreeBrowser.wgt
     ```
