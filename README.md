# MCBE Skinpack Generator

Ein Browser-basiertes Tool zum Erstellen von Minecraft Bedrock Edition Skinpacks.

## Features

- **3D Skin-Vorschau**: Interaktive 3D-Vorschau mit Three.js
  - Automatische Rotation der Skins
  - Zoom-Modus mit OrbitControls (Ziehen zum Drehen, Scrollrad zum Zoomen)
  - Korrekte UV-Mapping für Minecraft-Skins
  
- **Skinpack-Verwaltung**:
  - Mehrere Skins pro Pack möglich
  - Upload eigener PNG-Dateien (64x64 Pixel)
  - Automatische Platzhalter-Generierung
  - Validierung der Skin-Dateien
  
- **Daten-Persistenz**:
  - Automatisches Speichern in localStorage
  - Alle Formulardaten werden beim Neuladen wiederhergestellt
  - Platzhalter werden nur bei Bedarf neu generiert
  
- **Kommentar-System**:
  - Kommentare hinterlassen und lesen
  - Name ist optional (wird automatisch "Anonym" wenn leer)
  - Antworten auf Kommentare
  - Persistente Speicherung in localStorage
  - E-Mail-Benachrichtigungen an ytjulian@icloud.com (optional, über EmailJS)

## Verwendung

1. Öffne `index.html` in einem modernen Browser
2. Das Tool generiert automatisch ein Platzhalter-Skinpack beim Laden
3. Passe die Felder nach Bedarf an:
   - Skinpack-Name und Beschreibung
   - Skins hinzufügen/entfernen
   - Eigene PNG-Dateien hochladen (64x64 Pixel)
   - Sprache für die Textdatei auswählen
4. Klicke auf "Skinpack erzeugen & herunterladen" um das Pack zu erstellen
5. Das heruntergeladene `.mcpack` kann direkt in Minecraft Bedrock Edition importiert werden

## E-Mail-Benachrichtigungen einrichten (Optional)

Um E-Mail-Benachrichtigungen für neue Kommentare zu erhalten:

1. Erstelle ein kostenloses Konto bei [EmailJS](https://www.emailjs.com/)
2. Erstelle einen E-Mail-Service (z.B. Gmail, Outlook)
3. Erstelle ein E-Mail-Template mit folgenden Variablen:
   - `{{from_name}}` - Name des Kommentators
   - `{{message}}` - Kommentartext
   - `{{to_email}}` - Empfänger-E-Mail (wird auf ytjulian@icloud.com gesetzt)
   - `{{to_name}}` - Empfängername (Julian)
4. Notiere dir:
   - Public Key (aus dem Dashboard)
   - Service ID
   - Template ID
5. Öffne `index.html` und ersetze die Platzhalter:
   ```javascript
   emailjs.init('YOUR_PUBLIC_KEY');  // Zeile 16
   ```
6. Öffne `script.js` und ersetze in der Funktion `sendEmailNotification`:
   ```javascript
   await emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', templateParams);
   ```

**Hinweis**: Ohne EmailJS-Konfiguration funktioniert das Kommentar-System trotzdem vollständig - nur die E-Mail-Benachrichtigungen werden übersprungen. Benachrichtigungen werden an ytjulian@icloud.com gesendet.

## Technische Details

### Abhängigkeiten
- **Three.js**: 3D-Rendering der Skins
- **OrbitControls**: Kamera-Steuerung im Zoom-Modus
- **JSZip**: Erstellung der .mcpack-Dateien
- **EmailJS** (optional): E-Mail-Benachrichtigungen

### Datei-Struktur
```
.
├── index.html          # Haupt-HTML-Datei
├── script.js           # Hauptlogik und Formular-Handling
├── skin3d.js           # 3D-Renderer für Skins
├── style.css           # Styles
├── jszip.min.js        # JSZip-Bibliothek
├── three.module.min.js # Three.js-Bibliothek
├── OrbitControls.js    # OrbitControls für Three.js
└── README.md           # Diese Datei
```

### LocalStorage-Daten

Das Tool speichert folgende Daten in localStorage:

- **multiNotizenV5**: Formulardaten (Skinpack-Name, Beschreibung, Sprache, Skins)
- **mcbe_comments**: Kommentare und Antworten

Um alle Daten zu löschen, öffne die Browser-Konsole und führe aus:
```javascript
localStorage.clear();
location.reload();
```

## Browser-Kompatibilität

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

Moderne Browser mit WebGL-Unterstützung erforderlich.

## Lizenz

Dieses Projekt ist als Open Source verfügbar.

## Entwicklung

### Platzhalter neu generieren
Der Button "Platzhalter neu erzeugen" generiert neue Platzhalter-Skins nur für Skins ohne hochgeladene Datei.

### Skin-Validierung
Hochgeladene Skins werden validiert:
- Nur PNG-Dateien erlaubt
- Maximale Dateigröße: 1 MB
- Erforderliche Abmessungen: 64x64 Pixel

### 3D-Vorschau
Die 3D-Vorschau verwendet ein vereinfachtes Minecraft-Player-Modell (humanoid.customSlim) mit korrektem UV-Mapping für die Standardtextur-Layout.
