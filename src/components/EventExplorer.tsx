import { useMemo, useState } from "react";
import type { CgmEvent, Reading, Settings } from "../types";
import { analyzeEvent, repeatedMedian } from "../lib/eventAnalysis";
import { windowReadings } from "../lib/metrics";
import { dateKey, dateLabel, MINUTE, stampLabel, timeLabel } from "../lib/time";
import {
  convert,
  escapeHtml as esc,
  glucoseLabel,
  number,
} from "../lib/presentation";
import { Chart, chartBase, gappedData } from "./Charts";
import { Section } from "./Section";
export function EventExplorer({
  readings,
  events,
  settings,
  extent,
  typical,
}: {
  readings: Reading[];
  events: CgmEvent[];
  settings: Settings;
  extent: [number, number];
  typical: number;
}) {
  const [category, setCategory] = useState(""),
    [label, setLabel] = useState(""),
    [date, setDate] = useState(""),
    [query, setQuery] = useState(""),
    [selectedId, setSelectedId] = useState(""),
    [compare, setCompare] = useState(false),
    [window, setWindow] = useState("-60,180"),
    [page, setPage] = useState(0);
  const categories = useMemo(
    () => [...new Set(events.map((e) => e.category))].sort(),
    [events],
  );
  const labels = useMemo(
    () =>
      [
        ...new Set(
          events
            .filter((e) => !category || e.category === category)
            .map((e) => e.label),
        ),
      ].sort(),
    [events, category],
  );
  const filtered = useMemo(
    () =>
      events.filter(
        (e) =>
          (!category || e.category === category) &&
          (!label || e.label === label) &&
          (!date || dateKey(e.timestamp) === date) &&
          `${e.category} ${e.label} ${e.comment}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase()),
      ),
    [events, category, label, date, query],
  );
  const selected = filtered.find((e) => e.id === selectedId) || filtered[0];
  const repeats = selected
    ? filtered.filter(
        (e) => e.label === selected.label && e.category === selected.category,
      )
    : [];
  const selectedEvents = compare ? repeats : selected ? [selected] : [];
  const [before, after] = window.split(",").map(Number);
  const analyses = useMemo(
    () =>
      selectedEvents.map((event) => ({
        event,
        ...analyzeEvent(readings, event, typical),
      })),
    [readings, selectedEvents.map((e) => e.id).join("|"), typical],
  );
  const option = useMemo(() => {
    const base = chartBase(settings, extent);
    const series: any[] = selectedEvents.map((e, i) => ({
      name: stampLabel(e.timestamp),
      type: "line",
      showSymbol: false,
      smooth: false,
      connectNulls: false,
      lineStyle: {
        width: compare ? 1.2 : 2,
        opacity: compare ? 0.45 : 1,
        color: compare
          ? ["#4f8c74", "#7f8bb5", "#bc9363", "#789caa"][i % 4]
          : "#30785b",
      },
      data: gappedData(
        windowReadings(
          readings,
          e.timestamp + before * MINUTE,
          e.timestamp + after * MINUTE,
        ),
        typical,
        settings,
        (r) => (r.timestamp - e.timestamp) / MINUTE,
      ),
      tooltip: {
        formatter: (p: any) =>
          `${esc(e.label)} · ${esc(dateLabel(e.timestamp))}<br/>${number(p.value[0])} min · <b>${number(p.value[1])} ${settings.unit}</b>`,
      },
      ...(i === 0
        ? {
            markLine: {
              symbol: "none",
              silent: true,
              label: { formatter: "Evento", position: "insideEndTop" },
              lineStyle: { color: "#9baaa2", type: "dashed" },
              data: [{ xAxis: 0 }],
            },
          }
        : {}),
    }));
    if (compare && selectedEvents.length >= 2)
      series.push({
        name: "Mediana",
        type: "line",
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: "#244f40", width: 3 },
        data: repeatedMedian(
          readings,
          selectedEvents,
          before,
          after,
          typical,
        ).map((p) => [
          p.minute,
          p.value === null ? null : convert(p.value, settings.unit),
          p.n,
        ]),
        tooltip: {
          formatter: (p: any) =>
            `${number(p.value[0])} min<br/>Mediana: <b>${number(p.value[1])} ${settings.unit}</b><br/>${p.value[2]} repeticiones con datos`,
        },
      });
    return {
      ...base,
      grid: { ...base.grid, bottom: 48 },
      xAxis: {
        ...base.xAxis,
        min: before,
        max: after,
        name: "Minutos desde el evento",
        nameLocation: "middle",
        nameGap: 30,
      },
      series,
    };
  }, [
    readings,
    selectedEvents.map((e) => e.id).join("|"),
    settings,
    extent,
    typical,
    before,
    after,
    compare,
  ]);
  const safePage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 8) - 1),
  );
  const food = selected && /comida|meal|food/i.test(selected.category);
  const metric = (value: number | null, kind: "glucose" | "time" | "auc") =>
    value === null ? (
      <span className="undetermined">No determinado</span>
    ) : kind === "glucose" ? (
      `${glucoseLabel(value, settings.unit)} ${settings.unit}`
    ) : kind === "time" ? (
      `${number(value)} min`
    ) : (
      `${number(convert(value, settings.unit), 0)} ${settings.unit}·min`
    );
  return (
    <Section
      id="events"
      index="06"
      title="Eventos"
      note="Explora una respuesta o superpón las repeticiones de una misma etiqueta."
    >
      <div className="filters no-print">
        <label>
          Categoría
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setLabel("");
              setPage(0);
            }}
          >
            <option value="">Todas</option>
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Etiqueta
          <select
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              setPage(0);
            }}
          >
            <option value="">Todas</option>
            {labels.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="search-filter">
          Buscar
          <input
            type="search"
            placeholder="Etiqueta o comentario…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </label>
        {(category || label || date || query) && (
          <button
            className="text-button"
            onClick={() => {
              setCategory("");
              setLabel("");
              setDate("");
              setQuery("");
            }}
          >
            Limpiar filtros
          </button>
        )}
      </div>
      <div className="table-scroll no-print">
        <table className="event-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Categoría</th>
              <th>Etiqueta</th>
              <th>Comentario</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(safePage * 8, safePage * 8 + 8).map((e) => (
              <tr
                key={e.id}
                className={selected?.id === e.id ? "selected" : ""}
              >
                <td>{dateLabel(e.timestamp)}</td>
                <td>{timeLabel(e.timestamp)}</td>
                <td>
                  <span className="category-chip">{e.category}</span>
                </td>
                <td>
                  <button
                    className="event-select"
                    aria-pressed={selected?.id === e.id}
                    onClick={() => setSelectedId(e.id)}
                  >
                    {e.label}
                  </button>
                </td>
                <td>
                  {e.comment}
                  {e.durationMin !== undefined && (
                    <span className="duration">
                      {" "}
                      · {number(e.durationMin)} min
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length ? (
        <p className="empty-small">
          No hay eventos que coincidan con estos filtros.
        </p>
      ) : (
        <>
          <div className="table-footer no-print">
            <span>{filtered.length} eventos</span>
            <div>
              <button
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                ←
              </button>
              <span>
                {" "}
                {safePage + 1} / {Math.ceil(filtered.length / 8)}{" "}
              </span>
              <button
                disabled={(safePage + 1) * 8 >= filtered.length}
                onClick={() => setPage(safePage + 1)}
              >
                →
              </button>
            </div>
          </div>
          <div className="event-detail">
            <div className="event-detail-heading">
              <div>
                <span className="eyebrow">{selected!.category}</span>
                <h3>{selected!.label}</h3>
                <p>
                  {compare
                    ? `${repeats.length} repeticiones en el filtro actual`
                    : stampLabel(selected!.timestamp)}
                </p>
                <p className="event-comment">{selected!.comment}</p>
              </div>
              <div className="event-controls no-print">
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={compare}
                    disabled={repeats.length < 2}
                    onChange={(e) => setCompare(e.target.checked)}
                  />{" "}
                  Comparar repeticiones ({repeats.length})
                </label>
                <label>
                  Ventana
                  <select
                    value={window}
                    onChange={(e) => setWindow(e.target.value)}
                  >
                    <option value="-60,180">−60 / +180 min</option>
                    <option value="-30,120">−30 / +120 min</option>
                    <option value="-30,180">−30 / +180 min</option>
                    <option value="-60,240">−60 / +240 min</option>
                  </select>
                </label>
              </div>
            </div>
            <Chart
              option={option}
              height={300}
              label={`Respuesta a ${selected!.label}, de ${before} a ${after} minutos`}
            />
            {compare && repeats.length > 1 && (
              <p className="chart-note">
                Líneas finas: cada evento. Línea oscura: mediana cada 5 min, con
                al menos la mitad de las repeticiones (mínimo 2).
              </p>
            )}
            {food && (
              <div className="table-scroll">
                <table className="response-table">
                  <caption>
                    Métricas de respuesta · ventanas fijas, independientes del
                    zoom
                  </caption>
                  <thead>
                    <tr>
                      <th>Evento</th>
                      <th>
                        Baseline
                        <br />
                        <small>−15 a 0 min</small>
                      </th>
                      <th>
                        Pico
                        <br />
                        <small>0–180 min</small>
                      </th>
                      <th>Δ pico</th>
                      <th>Tiempo al pico</th>
                      <th>
                        iAUC positiva
                        <br />
                        <small>0–120 min</small>
                      </th>
                      <th>
                        Retorno
                        <br />
                        <small>hasta +240 min</small>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyses.map((a) => (
                      <tr key={a.event.id}>
                        <td>{stampLabel(a.event.timestamp)}</td>
                        <td>{metric(a.baseline, "glucose")}</td>
                        <td>{metric(a.peak, "glucose")}</td>
                        <td>{metric(a.delta, "glucose")}</td>
                        <td>{metric(a.timeToPeak, "time")}</td>
                        <td>{metric(a.auc, "auc")}</td>
                        <td>{metric(a.returnMin, "time")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="chart-note">
              Se requieren datos que cubran cada ventana. Solo se interpolan
              intervalos de hasta 2 veces el muestreo típico. El retorno exige
              baseline ±5 mg/dL durante 15 min después del pico. Las respuestas
              pueden incluir otros eventos cercanos.
            </p>
          </div>
        </>
      )}
    </Section>
  );
}
