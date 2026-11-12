import { useEffect, useMemo, useRef, useState } from "react";
import {
  COLORS,
  DEFAULTS,
  type DateOrder,
  type Session,
  type Settings,
} from "./types";
import { parseEvents, parseLibre } from "./lib/parsers";
import {
  clearSettings,
  loadSession,
  loadSettings,
  saveSession,
  saveSettings,
  validSettings,
} from "./lib/storage";
import { demoSession } from "./lib/demo";
import {
  dateBoundary,
  dateKey,
  dateLabel,
  DAY,
  dayKeys,
  dayStart,
  stampLabel,
} from "./lib/time";
import {
  agpPercentiles,
  durationLabel,
  hourlyDistribution,
  quality,
  summarize,
  timeInRange,
  typicalInterval,
} from "./lib/metrics";
import { bandLabels, glucoseLabel, number, percent } from "./lib/presentation";
import { Agp, Heatmap, Hourly, Timeline } from "./components/Charts";
import { EmptyChart, Section } from "./components/Section";
import { EventExplorer } from "./components/EventExplorer";
import { DailyReport } from "./components/DailyReport";

function Logo() {
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <rect width="40" height="40" rx="11" fill="currentColor" />
      <path
        d="M7 22h7l4-10 6 17 4-9h5"
        fill="none"
        stroke="white"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />
    </svg>
  );
}
function SettingsPanel({
  settings,
  onSave,
  onClose,
}: {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  return (
    <form
      className="settings-panel no-print"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const next = {
          ...settings,
          bands: [0, 1, 2, 3].map((i) =>
            Number(f.get(`band${i}`)),
          ) as Settings["bands"],
          target: [
            Number(f.get("low")),
            Number(f.get("high")),
          ] as Settings["target"],
        };
        if (!validSettings(next)) {
          setError(
            "Introduce umbrales positivos y estrictamente crecientes, y un rango de menor a mayor.",
          );
          return;
        }
        onSave(next);
        onClose();
      }}
    >
      <div>
        <h3>Bandas de visualización</h3>
        <p>
          Umbrales en mg/dL. Son bandas descriptivas, no categorías clínicas.
        </p>
      </div>
      <div className="settings-inputs">
        {settings.bands.map((v, i) => (
          <label key={i}>
            Umbral {i + 1}
            <input
              name={`band${i}`}
              type="number"
              min="1"
              max="1000"
              step="0.1"
              defaultValue={v}
              required
            />
          </label>
        ))}
        <span className="settings-divider" />
        <label>
          TIR desde
          <input
            name="low"
            type="number"
            min="1"
            max="1000"
            step="0.1"
            defaultValue={settings.target[0]}
            required
          />
        </label>
        <label>
          TIR hasta
          <input
            name="high"
            type="number"
            min="1"
            max="1000"
            step="0.1"
            defaultValue={settings.target[1]}
            required
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <div className="button-row">
        <button className="primary" type="submit">
          Aplicar bandas
        </button>
        <button
          type="button"
          onClick={() => {
            onSave({ ...DEFAULTS, unit: settings.unit });
            onClose();
          }}
        >
          Restablecer bandas
        </button>
        <button className="text-button" type="button" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </form>
  );
}
export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [settings, setSettings] = useState<Settings>(loadSettings),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [demo, setDemo] = useState(false),
    [restored, setRestored] = useState(false),
    [config, setConfig] = useState(false),
    [reset, setReset] = useState(false),
    [order, setOrder] = useState<DateOrder>("DMY"),
    [range, setRange] = useState("all"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [showScans, setShowScans] = useState(false),
    [heatPage, setHeatPage] = useState(0),
    [dragging, setDragging] = useState(false);
  const libreInput = useRef<HTMLInputElement>(null),
    eventInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    loadSession()
      .then((value) => {
        if (alive && value?.data?.readings?.length) {
          setSession(value);
          setRestored(true);
        }
      })
      .catch(() => {
        if (alive)
          setNotice(
            "No se puede acceder al almacenamiento local. Puedes seguir usando la aplicación durante esta sesión.",
          );
      })
      .finally(() => {
        if (alive) setReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);
  async function commit(next: Session) {
    setSession(next);
    setRestored(false);
    setDemo(false);
    try {
      await saveSession(next);
      setNotice("Última importación guardada solo en este navegador.");
    } catch {
      setNotice(
        "El informe está listo, pero no se ha podido guardar en este navegador.",
      );
    }
  }
  async function importLibre(files: FileList | File[]) {
    if (!files.length) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const selected = Array.from(files);
      if (selected.some((f) => f.size > 30 * 1024 * 1024))
        throw new Error(
          "El archivo supera los 30 MB. Exporta un periodo más corto.",
        );
      const data = parseLibre(
        await Promise.all(selected.map((f) => f.text())),
        order,
      );
      await commit({
        data,
        events: [],
        eventInvalid: 0,
        importedAt: new Date().toISOString(),
      });
      setRange("all");
      setFrom("");
      setTo("");
      setHeatPage(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setBusy(false);
      if (libreInput.current) libreInput.current.value = "";
    }
  }
  async function importEvents(file?: File) {
    if (!file || !session) return;
    setBusy(true);
    setError("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error("El CSV de eventos supera los 10 MB.");
      const result = parseEvents(await file.text(), order);
      const next = {
        ...session,
        events: result.events,
        eventInvalid: result.invalid,
      };
      if (demo) setSession(next);
      else await commit(next);
      setNotice(
        [
          `${result.events.length} eventos cargados.`,
          result.invalid
            ? `${result.invalid} filas inválidas descartadas.`
            : "",
          result.duplicates ? `${result.duplicates} duplicados omitidos.` : "",
          ...result.warnings,
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No se pudieron leer los eventos.",
      );
    } finally {
      setBusy(false);
      if (eventInput.current) eventInput.current.value = "";
    }
  }
  async function erase() {
    setBusy(true);
    try {
      await saveSession(null);
      clearSettings();
      setSession(null);
      setSettings(DEFAULTS);
      setDemo(false);
      setRestored(false);
      setReset(false);
      setError("");
      setNotice("Datos y preferencias borrados de este navegador.");
    } catch {
      setError(
        "No se ha podido completar el borrado local. Reinténtalo o borra los datos de este sitio desde tu navegador.",
      );
    } finally {
      setBusy(false);
    }
  }
  function updateSettings(next: Settings) {
    setSettings(next);
    try {
      saveSettings(next);
    } catch {
      setNotice(
        "Las preferencias se aplican, pero no se pueden guardar en este navegador.",
      );
    }
  }
  const readings = session?.data.readings || [];
  const fullStart = readings.length ? dayStart(readings[0].timestamp) : 0,
    fullEnd = readings.length
      ? dayStart(readings.at(-1)!.timestamp) + DAY
      : DAY;
  const start =
    range === "custom" && from
      ? dateBoundary(from)
      : range === "all" || range === "custom"
        ? fullStart
        : Math.max(fullStart, fullEnd - Number(range) * DAY);
  const end = range === "custom" && to ? dateBoundary(to) + DAY : fullEnd;
  const rangeValid = end > start && end - start <= 3660 * DAY;
  const filtered = useMemo(
    () =>
      rangeValid
        ? readings.filter((r) => r.timestamp >= start && r.timestamp < end)
        : [],
    [readings, start, end, rangeValid],
  );
  const filteredEvents = useMemo(
    () =>
      session?.events.filter(
        (e) => e.timestamp >= start && e.timestamp < end,
      ) || [],
    [session, start, end],
  );
  const scans = useMemo(
    () =>
      showScans
        ? session?.data.scans.filter(
            (r) => r.timestamp >= start && r.timestamp < end,
          ) || []
        : [],
    [session, showScans, start, end],
  );
  const typical = useMemo(() => typicalInterval(readings), [readings]);
  const stats = useMemo(() => summarize(filtered), [filtered]);
  const time = useMemo(
    () => timeInRange(readings, settings, start, end, typical),
    [readings, settings, start, end, typical],
  );
  const dataQuality = useMemo(
    () => quality(filtered, typical),
    [filtered, typical],
  );
  const days = useMemo(
    () => (rangeValid ? dayKeys(start, end) : []),
    [start, end, rangeValid],
  );
  const daysWithData = useMemo(
    () => new Set(filtered.map((r) => r.localDate)).size,
    [filtered],
  );
  const extent = useMemo<[number, number]>(() => {
    const values = [
      60,
      180,
      ...settings.bands,
      ...filtered.map((r) => r.glucose),
      ...scans.map((r) => r.glucose),
    ];
    let low = 60,
      high = 180;
    for (const v of values) {
      low = Math.min(low, v);
      high = Math.max(high, v);
    }
    return [
      low < 60 ? Math.max(0, Math.floor((low - 5) / 10) * 10) : 60,
      high > 180 ? Math.ceil((high + 5) / 10) * 10 : 180,
    ];
  }, [filtered, scans, settings.bands]);
  const hours = useMemo(() => hourlyDistribution(filtered), [filtered]);
  const hasAgp = useMemo(
    () => agpPercentiles(filtered).some((bin) => bin.n >= 3),
    [filtered],
  );
  const heatSafePage = Math.min(
    heatPage,
    Math.max(0, Math.ceil(days.length / 14) - 1),
  );
  const labels = bandLabels(settings);
  const summaryItems = [
    ["Mediana", glucoseLabel(stats.median, settings.unit), settings.unit],
    ["Mínimo", glucoseLabel(stats.min, settings.unit), settings.unit],
    ["Máximo", glucoseLabel(stats.max, settings.unit), settings.unit],
    ["Desv. estándar", glucoseLabel(stats.sd, settings.unit), settings.unit],
    ["GMI¹", number(stats.gmi, 1), "%"],
    [
      `Tiempo < ${glucoseLabel(settings.target[0], settings.unit)}`,
      number(percent(time.below, time.observed)),
      "%",
    ],
    [
      `Tiempo > ${glucoseLabel(settings.target[1], settings.unit)}`,
      number(percent(time.above, time.observed)),
      "%",
    ],
    [
      `Tiempo > ${glucoseLabel(settings.bands[3], settings.unit)}`,
      number(percent(time.aboveLast, time.observed)),
      "%",
    ],
  ];
  return (
    <div className="app-shell">
      <header className="app-header">
        <a className="brand" href="#top" aria-label="CGM Explorer, inicio">
          <Logo />
          <span>
            CGM <strong>Explorer</strong>
            <small>Tu glucosa, en perspectiva</small>
          </span>
        </a>
        <div className="header-right">
          <span className="local-badge">
            <span /> Local y privado
          </span>
          {session && (
            <button className="no-print" onClick={() => window.print()}>
              Imprimir informe <span aria-hidden="true">↗</span>
            </button>
          )}
        </div>
      </header>
      <main id="top">
        <input
          ref={libreInput}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          multiple
          className="file-input"
          aria-label="Seleccionar archivos de FreeStyle Libre"
          onChange={(e) => e.target.files && void importLibre(e.target.files)}
        />
        <input
          ref={eventInput}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="file-input"
          aria-label="Seleccionar CSV de eventos"
          onChange={(e) => void importEvents(e.target.files?.[0])}
        />
        {error && (
          <div className="alert error no-print" role="alert">
            {error}
            <button aria-label="Cerrar error" onClick={() => setError("")}>
              ×
            </button>
          </div>
        )}
        {notice && (
          <div className="alert notice no-print" role="status">
            {notice}
            <button aria-label="Cerrar aviso" onClick={() => setNotice("")}>
              ×
            </button>
          </div>
        )}
        {!ready ? (
          <p className="loading" role="status">
            Abriendo tu sesión local…
          </p>
        ) : !session ? (
          <>
            <section className="welcome">
              <div className="eyebrow">
                INFORMES DE GLUCOSA · FREESTYLE LIBRE
              </div>
              <h1>
                Encuentra el patrón.
                <br />
                <span>Entiende tu día.</span>
              </h1>
              <p>
                Tu glucosa, tus comidas, tu actividad.
                <br />
                Una perspectiva completa, a partir de tus archivos.
              </p>
            </section>
            <section
              className={`upload-card ${dragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!busy) void importLibre(e.dataTransfer.files);
              }}
            >
              <div className="upload-symbol">
                <UploadIcon />
              </div>
              <h2>Empieza con tu exportación de Libre</h2>
              <p>
                Arrastra uno o varios CSV aquí, o selecciónalos desde tu equipo.
              </p>
              <button
                className="primary large"
                disabled={busy}
                onClick={() => libreInput.current?.click()}
              >
                {busy ? "Preparando informe…" : "Cargar CSV Libre"}{" "}
                <span aria-hidden="true">↑</span>
              </button>
              <label className="date-order">
                Formato de fechas
                <select
                  value={order}
                  onChange={(e) => setOrder(e.target.value as DateOrder)}
                >
                  <option value="DMY">Día / mes / año (España)</option>
                  <option value="MDY">Mes / día / año (EE. UU.)</option>
                </select>
              </label>
              <p className="privacy-copy">
                Los archivos se procesan localmente en tu navegador. No se envía
                ningún dato.
                <br />
                La última importación se conserva aquí hasta que decidas
                borrarla.
              </p>
              <div className="demo-row">
                <span>¿Quieres echar un vistazo?</span>
                <button
                  className="text-button"
                  onClick={() => {
                    setSession(demoSession());
                    setDemo(true);
                    setRange("all");
                    setNotice(
                      "Explorando una demostración de 14 días. Los datos son simulados y no se guardan.",
                    );
                  }}
                >
                  Explorar informe de ejemplo →
                </button>
              </div>
            </section>
            <div className="feature-row">
              <div>
                <span>01</span>
                <h3>El periodo completo</h3>
                <p>Estadísticas, distribución horaria y perfil de 24 horas.</p>
              </div>
              <div>
                <span>02</span>
                <h3>Lo que pasa después</h3>
                <p>Relaciona comidas y actividad con tus curvas de glucosa.</p>
              </div>
              <div>
                <span>03</span>
                <h3>Cada día, comparable</h3>
                <p>Una escala común y un informe listo para imprimir.</p>
              </div>
            </div>
          </>
        ) : (
          <>
            <section className="report-heading">
              <div>
                <div className="eyebrow">
                  {demo
                    ? "DEMOSTRACIÓN · DATOS SIMULADOS"
                    : "TU INFORME DE GLUCOSA"}
                </div>
                <h1>Una mirada a tu glucosa</h1>
                <p>Exploración longitudinal a partir de FreeStyle Libre</p>
              </div>
              <div className="import-actions no-print">
                <button
                  disabled={busy}
                  className="primary"
                  onClick={() => libreInput.current?.click()}
                >
                  <UploadIcon />
                  {busy ? "Procesando…" : "Cargar CSV Libre"}
                </button>
                <button
                  disabled={busy}
                  onClick={() => eventInput.current?.click()}
                >
                  + Cargar eventos
                </button>
              </div>
            </section>
            <div className="session-info">
              <p>
                {stampLabel(readings[0].timestamp)} —{" "}
                {stampLabel(readings.at(-1)!.timestamp)}{" "}
                <span>· {number(readings.length, 0)} lecturas importadas</span>
              </p>
              <span className="no-print">
                {demo
                  ? "Datos de demostración"
                  : restored
                    ? "Última importación recuperada"
                    : "Guardado solo en este navegador"}
              </span>
            </div>
            <div className="control-bar no-print">
              <div
                className="range-buttons"
                role="group"
                aria-label="Rango temporal"
              >
                {[
                  ["all", "Todo"],
                  ["7", "7 días"],
                  ["14", "14 días"],
                  ["30", "30 días"],
                  ["custom", "Personalizado"],
                ].map(([value, text]) => (
                  <button
                    aria-pressed={range === value}
                    className={range === value ? "active" : ""}
                    key={value}
                    onClick={() => {
                      setRange(value);
                      setHeatPage(0);
                    }}
                  >
                    {text}
                  </button>
                ))}
              </div>
              <div className="view-controls">
                <label className="sr-only" htmlFor="unit">
                  Unidad
                </label>
                <select
                  id="unit"
                  value={settings.unit}
                  onChange={(e) =>
                    updateSettings({
                      ...settings,
                      unit: e.target.value as Settings["unit"],
                    })
                  }
                >
                  <option>mg/dL</option>
                  <option>mmol/L</option>
                </select>
                <button
                  onClick={() => setConfig(!config)}
                  aria-expanded={config}
                >
                  Bandas <span aria-hidden="true">⚙</span>
                </button>
              </div>
            </div>
            {range === "custom" && (
              <div className="custom-range no-print">
                <label>
                  Desde
                  <input
                    type="date"
                    value={from || dateKey(fullStart)}
                    min={dateKey(fullStart)}
                    max={dateKey(fullEnd - DAY)}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label>
                  Hasta
                  <input
                    type="date"
                    value={to || dateKey(fullEnd - DAY)}
                    min={dateKey(fullStart)}
                    max={dateKey(fullEnd - DAY)}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                {!rangeValid && (
                  <p role="alert">Elige un rango válido de hasta 10 años.</p>
                )}
              </div>
            )}
            {config && (
              <SettingsPanel
                settings={settings}
                onSave={updateSettings}
                onClose={() => setConfig(false)}
              />
            )}
            <div className="report-period">
              <span>
                {rangeValid
                  ? `${dateLabel(start, true)} — ${dateLabel(end - DAY, true)}`
                  : "Rango no válido"}
              </span>
              <span>
                {daysWithData} {daysWithData === 1 ? "día" : "días"} con datos ·{" "}
                {days.length}{" "}
                {days.length === 1 ? "día seleccionado" : "días seleccionados"}{" "}
                · {number(filtered.length, 0)} lecturas
              </span>
            </div>
            <nav
              className="section-nav no-print"
              aria-label="Secciones del informe"
            >
              <a href="#summary">Resumen</a>
              <a href="#timeline">Serie temporal</a>
              <a href="#profile">Perfil diario</a>
              {session.events.length > 0 && <a href="#events">Eventos</a>}
              <a href="#days">Días</a>
              <a href="#quality">Calidad</a>
            </nav>
            {!filtered.length ? (
              <div className="panel empty-small">
                <h2>No hay lecturas en este rango</h2>
                <p>Selecciona otro periodo para generar el informe.</p>
              </div>
            ) : (
              <>
                <Section
                  id="summary"
                  index="01"
                  title="Resumen"
                  note={`${durationLabel(time.observed)} de tiempo observado · ${daysWithData} ${daysWithData === 1 ? "día" : "días"} con lecturas`}
                  aside={
                    <span className="subtle-tag">
                      {session.data.source === "historic"
                        ? "Historial del sensor"
                        : "Escaneos manuales"}
                    </span>
                  }
                >
                  <div className="primary-metrics">
                    <div>
                      <span>Glucosa media</span>
                      <strong>
                        {glucoseLabel(stats.mean, settings.unit)}{" "}
                        <small>{settings.unit}</small>
                      </strong>
                      <p>Promedio de las lecturas</p>
                    </div>
                    <div>
                      <span>Tiempo en rango</span>
                      <strong>
                        {number(percent(time.inRange, time.observed))}{" "}
                        <small>%</small>
                      </strong>
                      <p>
                        {glucoseLabel(settings.target[0], settings.unit)}–
                        {glucoseLabel(settings.target[1], settings.unit)}{" "}
                        {settings.unit} · ponderado por tiempo
                      </p>
                    </div>
                    <div>
                      <span>Variabilidad · CV</span>
                      <strong>
                        {number(stats.cv)} <small>%</small>
                      </strong>
                      <p>Desviación / media</p>
                    </div>
                    <div>
                      <span>Cobertura</span>
                      <strong>
                        {number(time.coverage)} <small>%</small>
                      </strong>
                      <p>Del periodo seleccionado</p>
                    </div>
                  </div>
                  <div className="secondary-metrics">
                    {summaryItems.map(([title, value, unit]) => (
                      <div key={title}>
                        <span>{title}</span>
                        <strong>
                          {value} <small>{unit}</small>
                        </strong>
                      </div>
                    ))}
                  </div>
                  <div className="range-summary">
                    <div className="range-heading">
                      <h3>Tiempo en bandas</h3>
                      <span>{settings.unit} · sobre el tiempo observado</span>
                    </div>
                    <div
                      className="range-stack"
                      role="img"
                      aria-label={labels
                        .map(
                          (l, i) =>
                            `${l}: ${number(percent(time.bandTimes[i], time.observed))}%`,
                        )
                        .join("; ")}
                    >
                      {time.observed ? (
                        time.bandTimes.map(
                          (v, i) =>
                            v > 0 && (
                              <div
                                key={i}
                                style={{
                                  width: `${(v / time.observed) * 100}%`,
                                  background: COLORS[i],
                                }}
                                title={`${labels[i]} ${settings.unit}: ${number((v / time.observed) * 100)} % · ${durationLabel(v)} · ${time.counts[i]} lecturas`}
                              >
                                {v / time.observed > 0.08 && (
                                  <span>
                                    {number((v / time.observed) * 100, 0)}%
                                  </span>
                                )}
                              </div>
                            ),
                        )
                      ) : (
                        <span className="chart-note">
                          No hay intervalos suficientes para estimar tiempo.
                        </span>
                      )}
                    </div>
                    <div className="band-legend">
                      {labels.map((label, i) => (
                        <div key={label}>
                          <span
                            className="color-dot"
                            style={{ background: COLORS[i] }}
                          />
                          <span>
                            {label}
                            <strong>
                              {number(
                                percent(time.bandTimes[i], time.observed),
                              )}
                              %{" "}
                              <small>
                                · {durationLabel(time.bandTimes[i])}
                              </small>
                            </strong>
                            <small>
                              {number(time.counts[i], 0)}{" "}
                              {time.counts[i] === 1 ? "lectura" : "lecturas"}
                            </small>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p className="chart-note">
                    ¹ GMI calculado con la fórmula de 2018. No equivale a una
                    HbA1c de laboratorio.
                    {daysWithData < 14
                      ? " El periodo contiene menos de 14 días con datos: interprétalo como una estimación limitada."
                      : ""}
                  </p>
                </Section>
                <Section
                  id="timeline"
                  index="02"
                  title="Serie temporal completa"
                  note="La hora del dispositivo, sin desplazamientos. Arrastra la barra inferior para ampliar la curva."
                  aside={
                    session.data.scans.length > 0 ? (
                      <label className="check-label no-print">
                        <input
                          type="checkbox"
                          checked={showScans}
                          onChange={(e) => setShowScans(e.target.checked)}
                        />{" "}
                        Ver escaneos
                      </label>
                    ) : undefined
                  }
                >
                  <Timeline
                    readings={filtered}
                    scans={scans}
                    events={filteredEvents}
                    settings={settings}
                    extent={extent}
                    typical={typical}
                  />
                  {filteredEvents.length > 0 && (
                    <p className="chart-note event-legend">
                      ● Comida <span>▲ Actividad física</span>
                      <span>◆ Misc</span>
                      <span>■ Otras categorías</span>
                    </p>
                  )}
                </Section>
                <div className="chart-pair">
                  <Section
                    id="profile"
                    index="03"
                    title="Perfil de 24 horas"
                    note="Mediana y percentiles · intervalos de 15 minutos"
                  >
                    {hasAgp ? (
                      <>
                        <div className="agp-legend">
                          <span className="median-key" /> Mediana{" "}
                          <span className="inner-key" /> P25–P75{" "}
                          <span className="outer-key" /> P10–P90
                        </div>
                        <Agp
                          readings={filtered}
                          settings={settings}
                          extent={extent}
                        />
                      </>
                    ) : (
                      <EmptyChart>
                        Se muestran intervalos con datos de al menos 3 días
                        distintos.
                      </EmptyChart>
                    )}
                  </Section>
                  <Section
                    id="hourly"
                    index="04"
                    title="Distribución por hora"
                    note="Mediana, cuartiles, bigotes y valores atípicos"
                  >
                    {daysWithData >= 3 && filtered.length >= 72 ? (
                      <Hourly
                        readings={filtered}
                        settings={settings}
                        extent={extent}
                      />
                    ) : (
                      <EmptyChart>
                        Se requieren al menos 3 días y 72 lecturas; cada caja
                        necesita 5 lecturas.
                      </EmptyChart>
                    )}
                  </Section>
                </div>
                {daysWithData >= 3 && (
                  <details className="data-details">
                    <summary>
                      Consultar valores de la distribución horaria
                    </summary>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Hora</th>
                            <th>Lecturas</th>
                            <th>Mediana</th>
                            <th>Q1</th>
                            <th>Q3</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hours.map((h) => (
                            <tr key={h.hour}>
                              <td>{String(h.hour).padStart(2, "0")}:00</td>
                              <td>{h.n}</td>
                              <td>{glucoseLabel(h.median, settings.unit)}</td>
                              <td>{glucoseLabel(h.q1, settings.unit)}</td>
                              <td>{glucoseLabel(h.q3, settings.unit)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}
                <Section
                  id="heatmap"
                  index="05"
                  title="Patrón día × hora"
                  note="Mediana de cada hora. Las celdas vacías son periodos sin lecturas."
                  aside={
                    days.length > 14 ? (
                      <div className="pagination no-print">
                        <button
                          aria-label="Días anteriores del mapa"
                          disabled={heatSafePage === 0}
                          onClick={() => setHeatPage(heatSafePage - 1)}
                        >
                          ←
                        </button>
                        <span>
                          {heatSafePage + 1} / {Math.ceil(days.length / 14)}
                        </span>
                        <button
                          aria-label="Días siguientes del mapa"
                          disabled={(heatSafePage + 1) * 14 >= days.length}
                          onClick={() => setHeatPage(heatSafePage + 1)}
                        >
                          →
                        </button>
                      </div>
                    ) : undefined
                  }
                >
                  <Heatmap
                    readings={filtered}
                    days={days.slice(heatSafePage * 14, heatSafePage * 14 + 14)}
                    settings={settings}
                  />
                  <div className="heat-legend">
                    {labels.map((label, i) => (
                      <span key={label}>
                        <i style={{ background: COLORS[i] }} />
                        {label}
                      </span>
                    ))}
                    <span>{settings.unit}</span>
                  </div>
                  <p className="chart-note">
                    {days.length > 14
                      ? `Se muestran los días ${heatSafePage * 14 + 1}–${Math.min(days.length, heatSafePage * 14 + 14)} de ${days.length}. `
                      : ""}
                    Escala de color fija según las bandas de visualización.
                  </p>
                </Section>
                {session.events.length > 0 ? (
                  <EventExplorer
                    key={`events-${start}-${end}`}
                    readings={filtered}
                    events={filteredEvents}
                    settings={settings}
                    extent={extent}
                    typical={typical}
                  />
                ) : (
                  <div className="event-invitation no-print">
                    <div>
                      <h3>¿Qué pasó antes de esa curva?</h3>
                      <p>
                        Añade tus comidas, entrenamientos o cualquier otro
                        evento para explorar su respuesta.
                      </p>
                    </div>
                    <a href="./eventos-plantilla.csv" download>
                      Descargar plantilla CSV ↓
                    </a>
                    <button onClick={() => eventInput.current?.click()}>
                      + Cargar eventos
                    </button>
                  </div>
                )}
                <DailyReport
                  key={`days-${start}-${end}`}
                  readings={readings}
                  events={filteredEvents}
                  settings={settings}
                  extent={extent}
                  start={start}
                  end={end}
                  typical={typical}
                />
                <Section
                  id="quality"
                  index="08"
                  title="Calidad de datos"
                  note="El contexto que necesitas para leer las curvas."
                >
                  <div className="quality-grid">
                    {[
                      [
                        "Muestreo típico",
                        typical ? durationLabel(typical) : "No determinado",
                      ],
                      ["Cobertura del rango", `${number(time.coverage)} %`],
                      ["Lagunas en el rango", number(dataQuality.gaps, 0)],
                      [
                        "Mayor laguna",
                        dataQuality.largest
                          ? durationLabel(dataQuality.largest)
                          : "Sin lagunas detectadas",
                      ],
                      [
                        "Timestamps duplicados",
                        number(session.data.duplicates, 0),
                      ],
                      ["Lecturas descartadas", number(session.data.invalid, 0)],
                      [
                        "Sensores detectados",
                        number(session.data.sensorCount, 0),
                      ],
                      ["Eventos descartados", number(session.eventInvalid, 0)],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <span>{label}</span>
                        <strong>{value}</strong>
                      </div>
                    ))}
                  </div>
                  <p className="chart-note">
                    Muestreo: mediana de los intervalos de toda la importación.
                    Laguna: intervalo mayor que 3× el muestreo típico.
                    Duplicados, descartes y sensores corresponden a la
                    importación completa. Los sensores se identifican de forma
                    anónima.
                  </p>
                  {session.data.warnings.map((w) => (
                    <p className="data-warning" key={w}>
                      {w}
                    </p>
                  ))}
                </Section>
                <details className="methodology">
                  <summary>Cómo se calcula este informe</summary>
                  <div>
                    <p>
                      Media y desviación estándar poblacional se calculan sobre
                      las lecturas, sin ponderar. Los percentiles usan
                      interpolación lineal entre posiciones (tipo 7). GMI (%) =
                      3,31 + 0,02392 × media en mg/dL. Conversión: mmol/L =
                      mg/dL ÷ 18,0182.
                    </p>
                    <p>
                      El tiempo se asigna a la lectura anterior hasta la
                      siguiente, solo si el intervalo es ≤3× el típico. No se
                      extrapola después de la última lectura ni se rellenan
                      lagunas. La cobertura compara ese tiempo con los días
                      completos seleccionados; los bordes parciales cuentan como
                      tiempo sin datos. Los límites del TIR son inclusivos.
                    </p>
                    <p>
                      Las curvas se cortan cuando el intervalo supera 2× el
                      muestreo típico. El perfil de 24 horas toma primero una
                      mediana por día e intervalo de 15 minutos, y luego los
                      percentiles entre días; solo muestra intervalos con al
                      menos 3 días. Es descriptivo, no una validación de
                      patrones circadianos.
                    </p>
                    <p>
                      Los eventos usan la hora escrita en el archivo, incluso si
                      el timestamp ISO incluye Z o un offset. No se convierte a
                      UTC. Todas las horas deben referirse al mismo reloj local;
                      los cambios de hora repetidos no se pueden desambiguar sin
                      información adicional.
                    </p>
                    <p>
                      La iAUC integra solo el área por encima del baseline, con
                      regla trapezoidal y cruces exactos. No se calcula si la
                      ventana está incompleta. Baseline: mediana de −15 a 0 min;
                      pico: máximo de 0 a 180 min; retorno: primer tramo
                      posterior al pico dentro de ±5 mg/dL durante 15 min,
                      buscando hasta +240 min.
                    </p>
                    <p>
                      Referencia de la fórmula:{" "}
                      <a
                        href="https://pmc.ncbi.nlm.nih.gov/articles/PMC6196826/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Bergenstal et al., 2018
                      </a>
                      . Herramienta de exploración personal, no de diagnóstico.
                    </p>
                  </div>
                </details>
              </>
            )}
            <section className="session-tools no-print">
              <div>
                <p>
                  Los archivos se procesan localmente en tu navegador. No se
                  envía ningún dato.
                </p>
                <small>
                  Se conserva una sola importación. Cargar otros CSV de Libre
                  reemplaza los datos y sus eventos.{" "}
                  {demo ? "La demostración no se guarda." : ""}
                </small>
              </div>
              <div className="session-actions">
                <label>
                  Fechas al importar
                  <select
                    value={order}
                    onChange={(e) => setOrder(e.target.value as DateOrder)}
                  >
                    <option value="DMY">Día / mes / año</option>
                    <option value="MDY">Mes / día / año</option>
                  </select>
                </label>
                <button
                  className="danger-text"
                  onClick={() => setReset(!reset)}
                  aria-expanded={reset}
                >
                  Borrar datos locales
                </button>
              </div>
              {reset && (
                <div className="reset-confirm">
                  <p>
                    Se borrarán la última importación y las preferencias de este
                    navegador.
                  </p>
                  <button
                    disabled={busy}
                    className="danger-button"
                    onClick={() => void erase()}
                  >
                    Borrar y empezar de nuevo
                  </button>
                  <button onClick={() => setReset(false)}>Cancelar</button>
                </div>
              )}
            </section>
          </>
        )}
      </main>
      <footer>
        <span>CGM Explorer</span>
        <p>
          Exploración personal de datos · No es una herramienta de diagnóstico
        </p>
        <a
          href="https://github.com/deigote/cgm-explorer"
          className="no-print"
          target="_blank"
          rel="noreferrer"
        >
          Código fuente ↗
        </a>
      </footer>
    </div>
  );
}
