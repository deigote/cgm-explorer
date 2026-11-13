# CGM Explorer

Aplicación estática para explorar exportaciones de FreeStyle Libre en tu navegador: estadísticas, tiempo en bandas, serie temporal, perfil de 24 horas, boxplots, mapa día × hora, comparación de eventos y curvas diarias con una escala común.

**Web:** https://deigote.github.io/cgm-explorer/

## Uso local

Node.js 22.12 o superior.

```sh
npm install
npm run dev
```

```sh
npm test
npm run build
npm run preview
```

`dist/` contiene la web estática. Los recursos usan rutas relativas, compatibles con GitHub Pages. React, TypeScript, Vite, ECharts (SVG), PapaParse y Vitest; sin backend ni servicios externos de visualización.

## Importación

Selecciona uno o varios CSV de LibreView a la vez. Se detecta la cabecera después de los metadatos, con nombres españoles o ingleses, separador coma/punto y coma/tabulador, UTF-8/BOM y unidades mg/dL o mmol/L. El historial es la serie principal; si no contiene lecturas válidas, se usan los escaneos con un aviso. Los escaneos adicionales se pueden mostrar, pero no entran en las métricas del historial.

Escoge día/mes/año (predeterminado) o mes/día/año antes de importar. Las fechas ISO se reconocen automáticamente. **Siempre se conserva la hora escrita del dispositivo**. El eje usa coordenadas de calendario con getters UTC para evitar cambios por el huso horario del ordenador; no representa instantes UTC. En ISO con offset o Z tampoco se desplazan las horas. Los eventos deben usar el mismo reloj local. Las horas repetidas durante un cambio de horario no pueden desambiguarse y se tratan como duplicados.

Cada nueva importación de Libre reemplaza la anterior y sus eventos. Para unir exportaciones, selecciónalas juntas. Timestamps duplicados se colapsan; si discrepan, se conserva el primer valor y se informa del conflicto. Los identificadores de sensor se sustituyen por `Sensor 1`, `Sensor 2`, etc. No se conserva el CSV original ni su nombre.

El ejemplo en `tests/fixtures/example.csv` se ha recreado con los valores enumerados en el spec; no incluye nombres ni seriales reales. La demostración de 14 días es totalmente sintética y no se guarda.

## Eventos

Carga un CSV opcional con `timestamp`, `category` y `comment`. `label`, `duration_min` e `intensity` son opcionales; cualquier categoría es válida. Una etiqueta identifica eventos repetidos. Sin etiqueta, se usa el comentario si tiene hasta 80 caracteres.

```csv
timestamp,category,label,comment,duration_min
11-11-2026 08:30,Comida,Porridge,"40 g avena, leche y proteína",15
11-11-2026 18:00,Actividad Física,Fuerza,Entrenamiento,65
11-11-2026 20:15,Misc,Sauna,Sauna 40 minutos,40
```

`intensity` acepta `suave`, `media` o `alta`: verde, amarillo y rojo en los marcadores de eventos. Si está vacío, se conserva el color neutro. Los valores desconocidos generan un aviso y se importan sin intensidad. También puedes editarla en la tabla; se guarda con la última importación. Es una valoración personal, no una estimación calculada de carga glucémica o calórica.

Hay una [plantilla descargable](public/eventos-plantilla.csv) en la aplicación. Filtra por categoría, etiqueta, fecha o texto y selecciona un evento; activa «Comparar repeticiones» para superponer los eventos con la misma categoría y etiqueta dentro del filtro. Las métricas de comidas usan ventanas fijas aunque cambies la ventana visual.

## Criterios de cálculo

- Media y desviación estándar poblacional sin ponderar; percentiles tipo 7. CV = DE/media × 100. GMI = 3,31 + 0,02392 × media mg/dL ([Bergenstal et al., 2018](https://pmc.ncbi.nlm.nih.gov/articles/PMC6196826/)). No equivale a HbA1c medida. mmol/L = mg/dL ÷ 18,0182.
- Intervalo típico = mediana de las diferencias positivas de la importación completa. Para tiempo en rango, cada lectura representa el intervalo hasta la siguiente si este no supera 3× el típico. Se excluyen lagunas completas y no se extrapola la última muestra. Los límites del TIR son inclusivos. Los porcentajes tienen como denominador el **tiempo observado**; no se asigna el tiempo desconocido a ninguna banda.
- Cobertura = tiempo observado / días completos seleccionados. Las partes inicial/final sin datos también disminuyen la cobertura. Una sola muestra no genera duración. Los escaneos manuales pueden sesgar las métricas de tiempo.
- Los trazados se cortan en intervalos mayores de 2× el típico. No se suavizan las curvas. Las curvas diarias comparten X 00:00–24:00 e Y global (60–180 mg/dL, ampliado si hace falta).
- Perfil de 24 h: mediana por día/bin de 15 min, luego P10/P25/P50/P75/P90 entre días. Solo bins con ≥3 días; no es evidencia de robustez circadiana. Boxplots con ≥3 días y ≥72 lecturas globales, ≥5 muestras por caja; bigotes a 1,5 IQR y atípicos separados. El heatmap usa la mediana de las muestras de cada día/hora, sin imputación.
- Baseline: mediana de las lecturas −15 a 0 min (mínimo 2 y ventana cubierta). Pico: máximo 0–180 min, solo con ventana cubierta. iAUC: área positiva sobre baseline de 0–120 min, por trapecios con cruces exactos. Se interpolan únicamente extremos acotados por dos muestras distantes ≤2× el típico. Sin cobertura completa se indica «No determinado».
- Retorno: primer punto después del pico dentro de baseline ±5 mg/dL durante al menos 15 min, con cobertura continua; búsqueda hasta +240 min. La mediana de respuestas repetidas se calcula cada 5 min con al menos la mitad de las repeticiones (mínimo 2), sin rellenar lagunas largas.
- Todos los cálculos y eventos se limitan al periodo seleccionado. La integración temporal recorta los intervalos que cruzan los límites del periodo y la medianoche. El zoom de la serie completa amplía solo esa curva; el selector superior modifica todo el informe.

## Privacidad y almacenamiento

Los CSV se leen con la API de archivos del navegador y se procesan localmente. **No se suben a GitHub ni a ningún servidor**. No hay analítica, fuentes remotas ni scripts externos. GitHub Pages sirve los recursos estáticos de la aplicación.

La última importación normalizada (glucosa y eventos) se guarda en **IndexedDB**, en este navegador y origen; no hay histórico ni sincronización entre dispositivos. Las preferencias de bandas/unidad se guardan en `localStorage`. «Borrar datos locales» elimina ambos. Si el navegador bloquea o agota el almacenamiento, el informe funciona en memoria y muestra un aviso. En un dispositivo compartido, borra la sesión al terminar.

GitHub Pages usa un origen compartido con otros proyectos de la misma cuenta. El almacenamiento no está cifrado por esta aplicación y los sitios del mismo origen comparten el acceso técnico. No introduzcas código de terceros no fiable en ese origen. Un dominio independiente permite aislarlo si se requiere.

## Impresión

«Imprimir informe» abre la impresión del navegador; elige «Guardar como PDF». Se ocultan controles y navegación y se conservan los SVG. Los resúmenes y la tabla diaria incluyen todo el rango. **Las curvas diarias incluyen la página visible (7 días), el mapa la página visible (14 días) y el análisis de eventos la selección actual.** Selecciona otro periodo/página si quieres imprimir esas curvas. Se evita montar cientos de gráficos simultáneamente.

## GitHub Pages

En el repositorio: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

El workflow `.github/workflows/deploy-pages.yml` se ejecuta al hacer push a `main`: instala con `npm ci`, ejecuta tests, construye `dist/` y publica con las actions oficiales de GitHub Pages. También puede ejecutarse con `workflow_dispatch`.

## Verificación

Los tests cubren el fixture de 8 lecturas (media y mediana 103), fechas locales, CSV español/inglés y mmol/L, escaneos, duplicados, descartes, eventos, percentiles, bandas, TIR ponderado, medianoche, lagunas, cobertura, iAUC, retorno y 50.000 lecturas.

Para verificar una exportación privada equivalente al fixture sin copiarla al repositorio:

```sh
CGM_PRIVATE_FIXTURE=/ruta/al/example.csv npm test
TZ=America/Los_Angeles npm test
```

Herramienta de exploración personal de datos fisiológicos, no de diagnóstico ni de recomendación de tratamientos.
