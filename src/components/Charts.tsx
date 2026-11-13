import { useEffect, useRef } from "react";
import ReactECharts from "echarts-for-react/lib/core";
import * as echarts from "echarts/core";
import {
  LineChart,
  ScatterChart,
  BoxplotChart,
  HeatmapChart,
} from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  VisualMapComponent,
  MarkLineComponent,
  MarkAreaComponent,
  LegendComponent,
  AriaComponent,
} from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { renderChartForPrint } from "../lib/printChart";
import {
  INTENSITY_COLORS,
  COLORS,
  type CgmEvent,
  type Reading,
  type Settings,
} from "../types";
import {
  dateLabel,
  dateBoundary,
  minuteOfDay,
  MINUTE,
  stampLabel,
  timeLabel,
} from "../lib/time";
import {
  agpPercentiles,
  bandIndex,
  heatmapData,
  hourlyDistribution,
} from "../lib/metrics";
import {
  convert,
  escapeHtml as esc,
  glucoseLabel,
  number,
} from "../lib/presentation";
echarts.use([
  LineChart,
  ScatterChart,
  BoxplotChart,
  HeatmapChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  VisualMapComponent,
  MarkLineComponent,
  MarkAreaComponent,
  LegendComponent,
  AriaComponent,
  SVGRenderer,
]);
type Option = Record<string, any>;
export function Chart({
  option,
  height = 300,
  label,
  onEvents,
}: {
  option: Option;
  height?: number;
  label: string;
  onEvents?: Record<string, (event: any, instance: any) => void>;
}) {
  const ref = useRef<ReactECharts>(null),
    host = useRef<HTMLDivElement>(null),
    printHost = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const resize = () => ref.current?.getEchartsInstance().resize();
    // Printing must not depend on the screen viewport or on asynchronous
    // ResizeObserver callbacks. Render a separate, fixed-width vector copy
    // synchronously before the browser paginates, then scale its viewBox.
    const preparePrint = () => {
      const instance = ref.current?.getEchartsInstance();
      if (!instance || !printHost.current) return;
      printHost.current.innerHTML = renderChartForPrint(
        instance.getOption(),
        height,
      );
    };
    const observer = new ResizeObserver(resize);
    if (host.current) observer.observe(host.current);
    window.addEventListener("beforeprint", preparePrint);
    window.addEventListener("afterprint", resize);
    return () => {
      observer.disconnect();
      window.removeEventListener("beforeprint", preparePrint);
      window.removeEventListener("afterprint", resize);
    };
  }, [height]);
  return (
    <div ref={host} className="chart" role="img" aria-label={label}>
      <ReactECharts
        className="chart-screen"
        ref={ref}
        echarts={echarts}
        option={{
          animation: false,
          textStyle: {
            fontFamily:
              "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
            fontSize: 11,
            color: "#62716d",
          },
          aria: { enabled: true },
          ...option,
        }}
        notMerge
        onEvents={onEvents}
        opts={{ renderer: "svg" }}
        style={{ height, width: "100%" }}
      />
      <div ref={printHost} className="chart-print" aria-hidden="true" />
    </div>
  );
}
const tooltip = {
  trigger: "item",
  confine: true,
  backgroundColor: "#fff",
  borderColor: "#e0e6e3",
  padding: [10, 13],
  textStyle: { color: "#243c34", fontSize: 12 },
  extraCssText:
    "box-shadow:0 4px 20px #163b2814;line-height:1.6;max-width:300px;white-space:normal;",
};
// Axis hover works even when symbols are hidden. Keep the per-series formatting
// and omit synthetic null points used to break the curve across missing data.
export function lineTooltip(series: Option[]): Option {
  return {
    ...tooltip,
    trigger: "axis",
    triggerOn: "mousemove|click",
    enterable: true,
    extraCssText: tooltip.extraCssText + "max-height:240px;overflow-y:auto;",
    axisPointer: { type: "line", axis: "x", snap: true },
    formatter: (items: any[]) =>
      items
        .filter((p) => p.seriesType === "line" && p.value?.[1] != null)
        .map((p) => series[p.seriesIndex]?.tooltip?.formatter(p))
        .filter(Boolean)
        .join("<br/><br/>"),
  };
}
export function chartBase(
  settings: Settings,
  extent: [number, number],
  small = false,
): Option {
  return {
    grid: { left: small ? 44 : 52, right: 20, top: 25, bottom: 35 },
    tooltip,
    yAxis: {
      type: "value",
      min: convert(extent[0], settings.unit),
      max: convert(extent[1], settings.unit),
      name: small ? "" : settings.unit,
      nameTextStyle: { align: "left", padding: [0, 0, 0, -30] },
      axisLabel: { formatter: (v: number) => number(v, 1) },
      splitNumber: 4,
      axisLine: { show: false, onZero: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: "#edf0ee" } },
    },
    xAxis: {
      type: "value",
      axisLine: { lineStyle: { color: "#dfe5e1" } },
      axisTick: { show: false },
      axisLabel: { color: "#6c7973" },
      splitLine: { show: false },
    },
  };
}
function bandMap(s: Settings, seriesIndex: number | number[] = 0) {
  const b = s.bands.map((v) => convert(v, s.unit));
  return {
    show: false,
    type: "piecewise",
    dimension: 1,
    seriesIndex,
    pieces: [
      { lt: b[0], color: COLORS[0] },
      { gte: b[0], lt: b[1], color: COLORS[1] },
      { gte: b[1], lte: b[2], color: COLORS[2] },
      { gt: b[2], lte: b[3], color: COLORS[3] },
      { gt: b[3], color: COLORS[4] },
    ],
    outOfRange: { color: COLORS[2] },
  };
}
function thresholds(s: Settings) {
  return {
    silent: true,
    symbol: "none",
    label: { show: false },
    lineStyle: { color: "#d7dfda", type: "dashed", width: 1 },
    data: s.bands.map((v) => ({ yAxis: convert(v, s.unit) })),
  };
}
export function gappedData(
  readings: Reading[],
  typical: number,
  settings: Settings,
  x: (r: Reading) => number,
): (number | null)[][] {
  const data: (number | null)[][] = [];
  readings.forEach((r, i) => {
    if (i > 0 && r.timestamp - readings[i - 1].timestamp > 2 * typical)
      data.push([(x(readings[i - 1]) + x(r)) / 2, null]);
    data.push([x(r), convert(r.glucose, settings.unit)]);
  });
  return data;
}
const shape = (category: string) =>
  /comida|meal|food/i.test(category)
    ? "circle"
    : /actividad|ejercicio|exercise|activity/i.test(category)
      ? "triangle"
      : /misc/i.test(category)
        ? "diamond"
        : "rect";
export function eventSeries(
  events: CgmEvent[],
  s: Settings,
  extent: [number, number],
  x: (e: CgmEvent) => number,
): Option[] {
  return ["circle", "triangle", "diamond", "rect"].map((symbol) => ({
    name: "Eventos",
    type: "scatter",
    symbol,
    symbolSize: 8,
    z: 8,
    itemStyle: { color: "#314c41", borderColor: "#fff", borderWidth: 1 },
    data: events
      .filter((e) => shape(e.category) === symbol)
      .map((e) => ({
        value: [
          x(e),
          convert(extent[1] - (extent[1] - extent[0]) * 0.06, s.unit),
        ],
        event: e,
        itemStyle: {
          color: e.intensity ? INTENSITY_COLORS[e.intensity] : "#314c41",
        },
      })),
    tooltip: {
      trigger: "item",
      formatter: (p: any) => {
        const e = p.data.event as CgmEvent;
        return `<strong>${esc(e.category)} · ${esc(e.label)}</strong><br/>${esc(stampLabel(e.timestamp))}<br/>${esc(e.comment)}${e.intensity ? `<br/>Intensidad: ${e.intensity}` : ""}${e.durationMin !== undefined ? `<br/>Duración: ${number(e.durationMin)} min` : ""}`;
      },
    },
  }));
}
export function Timeline({
  readings,
  scans,
  events,
  settings,
  extent,
  typical,
  day,
}: {
  readings: Reading[];
  scans?: Reading[];
  events: CgmEvent[];
  settings: Settings;
  extent: [number, number];
  typical: number;
  day?: string;
}) {
  const isDay = !!day,
    x = (r: Reading) => (isDay ? minuteOfDay(r.timestamp) : r.timestamp);
  const base = chartBase(settings, extent, isDay);
  const first = readings[0]?.timestamp ?? dateBoundary(day || "2026-01-01"),
    last = readings.at(-1)?.timestamp ?? first;
  const eventGuides = (start: number, end: number) => {
    if (end - start > 2 * 1440 * MINUTE) return [];
    let previous = -Infinity;
    return events
      .filter((e) => {
        if (
          e.timestamp < start ||
          e.timestamp > end ||
          e.timestamp - previous < (end - start) / 12
        )
          return false;
        previous = e.timestamp;
        return true;
      })
      .map((e) => ({
        xAxis: isDay ? minuteOfDay(e.timestamp) : e.timestamp,
        label: {
          show: true,
          formatter: timeLabel(e.timestamp),
          position: "insideStartTop",
          rotate: 90,
          color: "#526f60",
          fontSize: 10,
        },
        lineStyle: { color: "#b7c7be", type: "dotted" },
      }));
  };
  const series: Option[] = [
    {
      name: "Glucosa",
      type: "line",
      showSymbol: readings.length < 20,
      symbolSize: 4,
      smooth: false,
      connectNulls: false,
      lineStyle: { width: 1.6 },
      data: gappedData(readings, typical, settings, x),
      markLine: {
        ...thresholds(settings),
        data: [...thresholds(settings).data, ...eventGuides(first, last)],
      },
      tooltip: {
        formatter: (p: any) => {
          if (p.value[1] === null) return "";
          const t = isDay
            ? dateBoundary(day!) + p.value[0] * MINUTE
            : p.value[0];
          const nearby = events
            .filter((e) => Math.abs(e.timestamp - t) <= 10 * MINUTE)
            .slice(0, 3);
          return `${esc(stampLabel(t))}<br/><strong>${number(p.value[1], 1)} ${settings.unit}</strong>${nearby.map((e) => `<br/>${esc(e.category)} · ${esc(e.label)}<br/>${esc(e.comment)}`).join("")}`;
        },
      },
    },
    ...eventSeries(events, settings, extent, (e) =>
      isDay ? minuteOfDay(e.timestamp) : e.timestamp,
    ),
  ];
  if (scans?.length)
    series.push({
      name: "Escaneo",
      type: "scatter",
      symbol: "emptyCircle",
      symbolSize: 5,
      itemStyle: { color: "#748b80" },
      data: scans.map((r) => [x(r), convert(r.glucose, settings.unit)]),
      tooltip: {
        trigger: "item",
        formatter: (p: any) =>
          `Escaneo · ${esc(stampLabel(isDay ? dateBoundary(day!) + p.value[0] * MINUTE : p.value[0]))}<br/>${number(p.value[1])} ${settings.unit}`,
      },
    });
  const durations = events
    .filter((e) => e.durationMin && e.durationMin > 0)
    .map((e) => [
      { xAxis: isDay ? minuteOfDay(e.timestamp) : e.timestamp },
      {
        xAxis: isDay
          ? Math.min(1440, minuteOfDay(e.timestamp) + e.durationMin!)
          : e.timestamp + e.durationMin! * MINUTE,
      },
    ]);
  if (durations.length)
    series[0].markArea = {
      silent: true,
      itemStyle: { color: "rgba(63,97,78,0.045)" },
      data: durations,
    };
  const option = {
    ...base,
    useUTC: true,
    tooltip: lineTooltip(series),
    grid: { ...base.grid, bottom: isDay ? 30 : 62 },
    xAxis: {
      ...base.xAxis,
      type: isDay ? "value" : "time",
      min: isDay ? 0 : first === last ? first - 5 * MINUTE : first,
      max: isDay ? 1440 : first === last ? last + 5 * MINUTE : last,
      ...(isDay
        ? { interval: 120 }
        : { splitNumber: 12, minInterval: 5 * MINUTE }),
      axisLabel: {
        showMinLabel: true,
        formatter: (v: number, index: number) =>
          isDay
            ? `${String(Math.floor(v / 60)).padStart(2, "0")}:00`
            : index === 0 || minuteOfDay(v) === 0
              ? `${dateLabel(v)}\n${timeLabel(v)}`
              : timeLabel(v),
        hideOverlap: true,
      },
    },
    visualMap: bandMap(settings),
    series,
    ...(!isDay
      ? {
          dataZoom: [
            { type: "inside", filterMode: "none" },
            {
              type: "slider",
              height: 18,
              bottom: 8,
              borderColor: "#e4e9e5",
              showDetail: false,
              brushSelect: false,
              fillerColor: "#cddfd780",
              handleStyle: { color: "#6a9482" },
            },
          ],
        }
      : {}),
  };
  return (
    <Chart
      option={option}
      onEvents={
        !isDay
          ? {
              datazoom: (event, instance) => {
                const zoom = event.batch?.[0] ?? event;
                const start = first + ((last - first) * zoom.start) / 100;
                const end = first + ((last - first) * zoom.end) / 100;
                instance.setOption({
                  series: [
                    {
                      markLine: {
                        ...thresholds(settings),
                        data: [
                          ...thresholds(settings).data,
                          ...eventGuides(start, end),
                        ],
                      },
                    },
                  ],
                });
              },
            }
          : undefined
      }
      height={isDay ? 155 : 330}
      label={
        isDay
          ? `Glucosa del ${day}, de 00:00 a 24:00`
          : "Serie temporal de glucosa. Usa la barra inferior para ampliar un intervalo."
      }
    />
  );
}
export function Agp({
  readings,
  settings,
  extent,
}: {
  readings: Reading[];
  settings: Settings;
  extent: [number, number];
}) {
  const bins = agpPercentiles(readings),
    base = chartBase(settings, extent),
    cv = (v: number) => convert(v, settings.unit);
  const series: Option[] = [
    {
      name: "Base externa",
      stack: "outer",
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
      data: bins.map((b) => [b.minute, b.n >= 3 ? cv(b.p10) : null]),
    },
    {
      name: "P10–P90",
      stack: "outer",
      lineStyle: { opacity: 0 },
      areaStyle: { color: "#d6e5df", opacity: 0.7 },
      data: bins.map((b) => [b.minute, b.n >= 3 ? cv(b.p90 - b.p10) : null]),
    },
    {
      name: "Base interna",
      stack: "inner",
      lineStyle: { opacity: 0 },
      areaStyle: { opacity: 0 },
      data: bins.map((b) => [b.minute, b.n >= 3 ? cv(b.p25) : null]),
    },
    {
      name: "P25–P75",
      stack: "inner",
      lineStyle: { opacity: 0 },
      areaStyle: { color: "#9fc3b3", opacity: 0.65 },
      data: bins.map((b) => [b.minute, b.n >= 3 ? cv(b.p75 - b.p25) : null]),
    },
    {
      name: "Mediana",
      lineStyle: { width: 2, color: "#2f6c55" },
      data: bins.map((b) => [b.minute, b.n >= 3 ? cv(b.median) : null]),
      markLine: thresholds(settings),
    },
  ].map((item) => ({
    ...item,
    type: "line",
    smooth: false,
    showSymbol: false,
    connectNulls: false,
    tooltip: { show: false },
  }));
  return (
    <Chart
      label="Perfil diario: mediana y bandas P25–P75 y P10–P90, en intervalos de 15 minutos"
      option={{
        ...base,
        xAxis: {
          ...base.xAxis,
          min: 0,
          max: 1440,
          interval: 240,
          axisLabel: {
            formatter: (v: number) => `${String(v / 60).padStart(2, "0")}:00`,
          },
        },
        tooltip: {
          ...tooltip,
          trigger: "axis",
          formatter: (p: any[]) => {
            const minute = p[0]?.value[0],
              b = bins.find((b) => b.minute === minute);
            return b && b.n >= 3
              ? `${String(Math.floor(b.minute / 60)).padStart(2, "0")}:${String(Math.floor(b.minute % 60)).padStart(2, "0")} · ${b.n} días<br/>Mediana: <b>${glucoseLabel(b.median, settings.unit)}</b><br/>P25–P75: ${glucoseLabel(b.p25, settings.unit)}–${glucoseLabel(b.p75, settings.unit)}<br/>P10–P90: ${glucoseLabel(b.p10, settings.unit)}–${glucoseLabel(b.p90, settings.unit)} ${settings.unit}`
              : "Sin suficientes días en este intervalo";
          },
        },
        series,
      }}
    />
  );
}
export function Hourly({
  readings,
  settings,
  extent,
}: {
  readings: Reading[];
  settings: Settings;
  extent: [number, number];
}) {
  const hours = hourlyDistribution(readings),
    base = chartBase(settings, extent);
  const format = (p: any) => {
    const h = hours[p.dataIndex];
    return h
      ? `${String(h.hour).padStart(2, "0")}:00–${String(h.hour).padStart(2, "0")}:59<br/>Mediana: <b>${glucoseLabel(h.median, settings.unit)}</b><br/>Q1–Q3: ${glucoseLabel(h.q1, settings.unit)}–${glucoseLabel(h.q3, settings.unit)} ${settings.unit}<br/>Lecturas: ${h.n}`
      : "";
  };
  return (
    <Chart
      label="Distribución por hora: cuartiles, mediana, bigotes de 1,5 IQR y valores atípicos"
      option={{
        ...base,
        xAxis: {
          ...base.xAxis,
          type: "category",
          data: hours.map((h) => String(h.hour).padStart(2, "0")),
          boundaryGap: true,
        },
        series: [
          {
            type: "boxplot",
            data: hours.map((h) => ({
              value:
                h.n >= 5
                  ? [h.low, h.q1, h.median, h.q3, h.high].map((v) =>
                      convert(v!, settings.unit),
                    )
                  : ["-", "-", "-", "-", "-"],
              itemStyle: {
                color: COLORS[bandIndex(h.median, settings.bands)] + "55",
                borderColor: COLORS[bandIndex(h.median, settings.bands)],
              },
            })),
            tooltip: { formatter: format },
            boxWidth: [5, 20],
          },
          {
            type: "scatter",
            symbolSize: 3,
            itemStyle: { color: "#7f8a84", opacity: 0.6 },
            data: hours.flatMap((h) =>
              h.n >= 5
                ? h.outliers.map((v) => [h.hour, convert(v, settings.unit)])
                : [],
            ),
            tooltip: {
              formatter: (p: any) =>
                `${p.value[0]}:00 · ${number(p.value[1])} ${settings.unit}`,
            },
          },
        ],
      }}
    />
  );
}
export function Heatmap({
  readings,
  days,
  settings,
}: {
  readings: Reading[];
  days: string[];
  settings: Settings;
}) {
  const data = heatmapData(readings).filter((c) => days.includes(c.day)),
    indexes = new Map(days.map((d, i) => [d, i]));
  return (
    <Chart
      height={Math.max(180, days.length * 25 + 65)}
      label="Mediana de glucosa por día y hora. Las celdas vacías no contienen lecturas."
      option={{
        grid: { left: 65, right: 20, top: 12, bottom: 30 },
        tooltip: {
          ...tooltip,
          formatter: (p: any) => {
            const c = p.data.cell;
            return `${dateLabel(dateBoundary(c.day))} · ${String(c.hour).padStart(2, "0")}:00–${String(c.hour).padStart(2, "0")}:59<br/>Mediana: <b>${glucoseLabel(c.median, settings.unit)} ${settings.unit}</b><br/>${c.n} lecturas`;
          },
        },
        xAxis: {
          type: "category",
          data: Array.from({ length: 24 }, (_, h) =>
            String(h).padStart(2, "0"),
          ),
          splitArea: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        yAxis: {
          type: "category",
          data: days.map((d) => dateLabel(dateBoundary(d))),
          inverse: true,
          axisLine: { show: false },
          axisTick: { show: false },
          splitArea: { show: true, areaStyle: { color: ["#f5f7f5"] } },
        },
        visualMap: { ...bandMap(settings), dimension: 2 },
        series: [
          {
            type: "heatmap",
            data: data.map((c) => ({
              value: [
                c.hour,
                indexes.get(c.day),
                convert(c.median, settings.unit),
              ],
              cell: c,
            })),
            itemStyle: { borderWidth: 2, borderColor: "#fff" },
            emphasis: { itemStyle: { borderColor: "#3b5548" } },
          },
        ],
      }}
    />
  );
}
