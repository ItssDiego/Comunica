# Comunica — v1.0

Aplicación web (PWA) de comunicación asistida para una paciente con traqueostomía que no puede hablar y tiene movilidad limitada. **La opera un familiar**; la paciente responde con la cabeza (asentir = sí, negar = no).

> **Aviso.** Herramienta auxiliar de comunicación. No es un dispositivo médico certificado, no diagnostica, no interpreta movimientos automáticamente y no reemplaza la comunicación con el personal de salud. Ante cualquier signo de dificultad respiratoria, avisar al personal de inmediato.

---

## 1. Análisis previo

### Supuesto central de diseño
Como no sabemos si ella puede usar la pantalla táctil ni sostener la mirada, **el teléfono lo maneja el familiar** (escaneo asistido por compañero, *partner-assisted scanning*). La app nunca deduce nada por sí misma: el familiar marca lo que la paciente indicó.

### Riesgos de usabilidad y accesibilidad identificados → mitigación aplicada

| Riesgo | Mitigación en v1 |
|---|---|
| Registrar como "dicho" algo que ella no confirmó | Doble paso: elegir → pantalla "¿Quieres decir…?" → solo **SÍ — asintió** lo registra como confirmado. NO no registra nada. |
| Movimiento de cabeza ambiguo (fatiga, molestia por la cánula, tos) | Botón **"? No está clara"** en confirmación y escaneo, con instrucciones (repetir despacio, descansar). Se registra en el historial como "Respuesta no clara". |
| Urgencias respiratorias retrasadas por usar la app | Opciones urgentes en rojo; la pantalla de confirmación dice **avisar al personal AHORA, sin esperar a confirmar**. |
| "Ninguna de estas" no tenía salida | Al final de cada lista de escaneo: "Fin de la lista. No eligió ninguna opción" + empezar de nuevo / salir. |
| Escaneo letra a letra demasiado lento y agotador | Abecedario en escaneo de **dos pasos** (grupo → letra): máx. ~11 preguntas por letra en vez de 27. |
| Cierre accidental con el botón "atrás" de Android | El botón atrás navega dentro de la app; no la cierra desde el inicio. |
| Pantalla que se apaga en medio de una conversación | Bloqueo de pantalla encendida (Wake Lock) activable en Ajustes. |
| Avisos que tapan botones | Los avisos temporales salen arriba y no bloquean toques. |
| Baja visión / cansancio visual | Alto contraste, fondo negro o blanco, tres tamaños de letra; con letra grande la lista pasa a una columna. |
| Datos de salud en la nube | Sin backend ni red: todo queda en `localStorage` del teléfono. |

### Arquitectura mínima
- HTML + CSS + JavaScript puro, **sin dependencias ni build**. Unos ~50 KB en total.
- `localStorage` para ajustes, frases personalizadas, historial (máx. 300 entradas) y frase en curso.
- Service worker para funcionar **sin internet** después de la primera carga.
- Voz opcional con la síntesis de voz del propio Android (Web Speech API, no usa servicios externos).

```
comunica/
├── index.html            Estructura
├── styles.css            Estilos (temas, tamaños)
├── vocab.js              Vocabulario editable (categorías, palabras, abecedario)
├── app.js                Lógica (navegación, escaneo, confirmación, historial, ajustes)
├── sw.js                 Modo offline
├── manifest.webmanifest  Instalación como app
└── icons/                Íconos 192 y 512 px
```

### Decisiones que necesitan validación clínica
Estas decisiones las tomé yo como valores razonables. **Conviene confirmarlas con el equipo tratante (médico, enfermería, fonoaudiología o terapia ocupacional)** antes de depender de la app:

1. **Señales SÍ/NO.** ¿Asentir y negar son seguros y sostenibles para ella? Hay que considerar el movimiento con la cánula, la fatiga y si conviene una señal alternativa (hombros, parpadeo).
2. **Doble confirmación** (elegir + confirmar): es más segura, pero cansa más. ¿Ella la tolera?
3. **Qué se marca como urgente.** Hoy: "Me cuesta respirar" y "Tengo flemas, necesito que me aspiren". ¿Debe incluirse "Me duele el pecho" u otras?
4. **Protocolo ante una urgencia**: a quién avisar y cómo (timbre, enfermería). La app solo lo recuerda.
5. **Vocabulario**: si "Tengo sed" o "¿Puedo comer o tomar algo?" son adecuados según sus restricciones de vía oral, y qué frases faltan.
6. **Duración de las sesiones** y señales de cansancio para parar.
7. **Dolor**: la app ofrece "Me duele poco / mucho". Si el equipo usa una escala (0–10 u otra), se puede añadir tal cual la usen.

---

## 2. Cómo se usa (para el familiar)

1. Colócate donde ella vea la pantalla y tú puedas leerla.
2. **Toque directo**: si ya sospechas el tema, toca la categoría y luego la frase.
3. **Escaneo** (botón azul "▶ Escanear opciones"): lee en voz alta la opción grande.
   - Si **asiente** → "✓ Asintió — elegir".
   - Si **niega** → "Negó — siguiente ▶".
   - Si no está claro → "? No está clara" y repite.
4. Siempre aparece **"¿Quieres decir…?"**: pregúntaselo y marca SÍ, NO o No está clara.
5. Con SÍ, el mensaje se muestra en grande (y se lee en voz alta si la voz está activada) para enseñarlo al personal. Queda en el **Historial**.
6. **Respuestas rápidas** (barra inferior): SÍ, NO, REPETIR ("Repite, por favor") y CANCELAR ("Cancela, olvídalo", que además vuelve al inicio y sale del escaneo). Se muestran en grande y quedan en el historial.
7. **Construir frase**: palabras sueltas + abecedario. "+ Añadir a la frase" en la confirmación permite juntar piezas. La frase completa también pasa por "¿Quieres decir…?".
8. **Ajustes → Frases personalizadas**: añade nombres de familiares ("Quiero ver a …") o frases propias de ella. Aparecen primero en su categoría, marcadas con ★.

---

## 3. Instalación en Android (Honor X5b u otro)

El modo offline (service worker) **solo funciona en HTTPS o en `localhost`**. Por eso conviene publicarla en un hosting estático gratuito.

### Opción A — GitHub Pages (recomendada, gratis)
1. Crea un repositorio en GitHub y sube **el contenido** de la carpeta `comunica/` (que `index.html` quede en la raíz).
2. En el repositorio: *Settings → Pages → Deploy from a branch → `main` / `(root)`* → Save.
3. En uno o dos minutos tendrás una URL tipo `https://TU_USUARIO.github.io/NOMBRE_REPO/`.
4. En el Honor, abre esa URL en **Chrome**.
5. Menú ⋮ → **"Añadir a pantalla de inicio"** o **"Instalar aplicación"**.
6. Abre la app desde el ícono una vez **con internet**. A partir de ahí funciona sin conexión.

Otra opción es cualquier hosting estático con HTTPS (Netlify, Cloudflare Pages, etc.).

### Opción B — Prueba local por USB (sin publicar)
Requiere activar la *Depuración USB* en el teléfono y tener `adb` en la PC.
```bash
cd comunica
python3 -m http.server 8080
adb reverse tcp:8080 tcp:8080      # el teléfono ve tu PC como localhost
```
En el teléfono abre `http://localhost:8080` en Chrome. Al ser `localhost`, el modo offline también funciona.

> Si abres la app por la IP de tu red local (`http://192.168.x.x:8080`), funciona, pero **sin modo offline**.

### Voz en español
La voz depende del motor "Texto a voz" de Android. Comprueba en **Ajustes de Comunica** si dice "Voz en español encontrada". Si no aparece, instala o selecciona una voz en español en la configuración de texto a voz del teléfono (la ruta del menú varía según la versión del sistema). Sin voz, la app funciona igual y muestra todo en pantalla.

### Actualizar la app
Edita los archivos, sube **el número de `CACHE`** en `sw.js` (p. ej. `comunica-v2`) y publica. Los teléfonos reciben la versión nueva tras abrir la app con internet y volverla a abrir.

---

## 4. Lista de pruebas en el teléfono

Hacerla **antes de usarla con la paciente**, con dos familiares (uno hace de paciente):

- [ ] Se instala desde Chrome y abre a pantalla completa.
- [ ] Con **modo avión**, la app abre y funciona.
- [ ] Categoría → frase → "¿Quieres decir…?" → SÍ → se muestra en grande → aparece en Historial.
- [ ] NO regresa a la lista sin registrar nada.
- [ ] "No está clara" muestra el aviso y queda en el historial.
- [ ] Escaneo: asentir entra a la categoría; negar avanza; al final aparece "Fin de la lista".
- [ ] Opción urgente: aviso rojo en la confirmación y pantalla roja al confirmar.
- [ ] Abecedario en escaneo: grupo → letra → la letra aparece en la frase.
- [ ] Construir frase → Frase lista → confirmar → la frase se vacía.
- [ ] SÍ / NO / REPETIR / CANCELAR muestran el mensaje en grande.
- [ ] El botón atrás de Android navega dentro de la app y no la cierra.
- [ ] La pantalla no se apaga durante el uso (con la opción activada).
- [ ] Probar voz en Ajustes.
- [ ] Letra "Muy grande" y fondo blanco se ven bien desde la distancia real de la cama.
- [ ] Borrar historial pide confirmación y lo vacía.
- [ ] Añadir y eliminar una frase personalizada.

---

## 5. Estado de verificación

**Verificado** en un navegador Chromium automatizado con viewport móvil de 360×780, táctil:
- 50 comprobaciones de flujo (todas las anteriores salvo voz real, instalación y Wake Lock).
- Sin errores de consola.
- Sin desbordamiento horizontal en 320×640, 360×780 y horizontal.
- Funcionamiento offline con el service worker.

**No verificado:**
- En un Honor X5b real.
- La voz en español en ese teléfono.
- La instalación desde Chrome Android.
- El Wake Lock en ese dispositivo.

Esa es la lista de la sección 4.

## 6. Limitaciones conocidas / siguientes pasos posibles
- Sin predicción de palabras en el abecedario (posible v2 si se usa mucho).
- Sin escaneo automático por tiempo: es manual a propósito, porque es más fiable con un familiar presente. Se puede añadir si el equipo lo recomienda.
- El historial no se exporta. Para mostrarlo al personal se enseña la pantalla.
- Los datos se pierden si se borran los datos de Chrome o se desinstala la app.
