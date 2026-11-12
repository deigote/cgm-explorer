import { useMemo, useState } from "react";
import type { CgmEvent, Reading, Settings } from "../types";
import { dailyMetrics } from "../lib/metrics";
import { dateBoundary, dateKey, dateLabel } from "../lib/time";
import { glucoseLabel, number } from "../lib/presentation";
import { Timeline } from "./Charts";
import { Section } from "./Section";
type SortKey =
  | "day"
  | "mean"
  | "median"
  | "min"
  | "max"
  | "sd"
  | "cv"
  | "tir"
  | "below"
  | "above";
export function DailyReport({
  readings,
  events,
  settings,
  extent,
  start,
  end,
  typical,
}: {
  readings: Reading[];
  events: CgmEvent[];
  settings: Settings;
  extent: [number, number];
  start: number;
  end: number;
  typical: number;
}) {
  const days = useMemo(
    () => dailyMetrics(readings, settings, start, end, typical),
    [readings, settings, start, end, typical],
  );
  const [sort, setSort] = useState<SortKey>("day"),
    [descending, setDescending] = useState(false),
    [page, setPage] = useState(0);
  const sorted = useMemo(
    () =>
      [...days].sort((a, b) => {
        const av = a[sort],
          bv = b[sort];
        if (typeof av === "number" && typeof bv === "number") {
          if (!Number.isFinite(av)) return 1;
          if (!Number.isFinite(bv)) return -1;
          return (av - bv) * (descending ? -1 : 1);
        }
        return String(av).localeCompare(String(bv)) * (descending ? -1 : 1);
      }),
    [days, sort, descending],
  );
  const safePage = Math.min(page, Math.max(0, Math.ceil(days.length / 7) - 1));
  const shown = days.slice(safePage * 7, safePage * 7 + 7);
  const selectDay = (day: string) => {
    setPage(Math.floor(days.findIndex((d) => d.day === day) / 7));
    setTimeout(
      () =>
        document
          .getElementById(`day-${day}`)
          ?.scrollIntoView({ behavior: "smooth", block: "start" }),
      100,
    );
  };
  const headers: [SortKey, string][] = [
    ["day", "Día"],
    ["mean", "Media"],
    ["median", "Mediana"],
    ["min", "Mín."],
    ["max", "Máx."],
    ["sd", "DE"],
    ["cv", "CV %"],
    ["tir", "TIR %"],
    ["below", `< ${glucoseLabel(settings.target[0], settings.unit)} %`],
    ["above", `> ${glucoseLabel(settings.target[1], settings.unit)} %`],
  ];
  return (
    <Section
      id="days"
      index="07"
      title="Días"
      note="Una misma escala para comparar cada día. Pulsa una fecha de la tabla para ir a su curva."
    >
      <div className="table-scroll daily-table-wrap">
        <table className="daily-table">
          <thead>
            <tr>
              {headers.map(([key, title]) => (
                <th
                  key={key}
                  aria-sort={
                    sort === key
                      ? descending
                        ? "descending"
                        : "ascending"
                      : "none"
                  }
                >
                  <button
                    onClick={() => {
                      if (key === sort) setDescending(!descending);
                      else {
                        setSort(key);
                        setDescending(false);
                      }
                    }}
                  >
                    {title}{" "}
                    <span aria-hidden="true">
                      {sort === key ? (descending ? "↓" : "↑") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((d) => (
              <tr key={d.day}>
                <td>
                  <button
                    className="text-button"
                    onClick={() => selectDay(d.day)}
                  >
                    {dateLabel(dateBoundary(d.day))}
                  </button>
                </td>
                {(["mean", "median", "min", "max", "sd"] as const).map(
                  (key) => (
                    <td key={key}>{glucoseLabel(d[key], settings.unit)}</td>
                  ),
                )}
                {(["cv", "tir", "below", "above"] as const).map((key) => (
                  <td key={key}>{number(d[key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="daily-nav">
        <p>
          {dateLabel(dateBoundary(shown[0].day))} –{" "}
          {dateLabel(dateBoundary(shown.at(-1)!.day))}
          <span>
            {" "}
            · {settings.unit} · TIR{" "}
            {glucoseLabel(settings.target[0], settings.unit)}–
            {glucoseLabel(settings.target[1], settings.unit)}
          </span>
        </p>
        <div className="pagination no-print">
          <button
            aria-label="Semana anterior"
            disabled={safePage === 0}
            onClick={() => setPage(safePage - 1)}
          >
            ←
          </button>
          <span>
            {safePage + 1} / {Math.ceil(days.length / 7)}
          </span>
          <button
            aria-label="Semana siguiente"
            disabled={(safePage + 1) * 7 >= days.length}
            onClick={() => setPage(safePage + 1)}
          >
            →
          </button>
        </div>
      </div>
      {shown.map((d) => (
        <div className="daily-chart" id={`day-${d.day}`} key={d.day}>
          <div className="day-heading">
            <h3>
              {new Intl.DateTimeFormat("es-ES", {
                weekday: "short",
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              }).format(dateBoundary(d.day))}
            </h3>
            <span>
              {d.count
                ? `Media ${glucoseLabel(d.mean, settings.unit)} · TIR ${number(d.tir)} % · ${d.count} lecturas`
                : "Sin lecturas"}
            </span>
          </div>
          <Timeline
            readings={d.readings}
            events={events.filter((e) => dateKey(e.timestamp) === d.day)}
            settings={settings}
            extent={extent}
            typical={typical}
            day={d.day}
          />
        </div>
      ))}
      {days.length > 7 && (
        <p className="chart-note">
          La impresión incluye esta página de curvas diarias. El resumen y la
          tabla abarcan todo el rango seleccionado.
        </p>
      )}
    </Section>
  );
}
