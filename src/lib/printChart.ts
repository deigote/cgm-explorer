import * as echarts from "echarts/core";

/** A paper-sized vector copy independent of viewport size and resize timing. */
export function renderChartForPrint(
  options: Record<string, any>,
  height: number,
) {
  const printable = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 700,
    height,
  });
  try {
    printable.setOption({
      ...options,
      animation: false,
      aria: { enabled: false },
      ...(Array.isArray(options.dataZoom)
        ? {
            dataZoom: options.dataZoom.map((zoom: Record<string, any>) => ({
              ...zoom,
              show: false,
            })),
          }
        : {}),
    });
    return printable.renderToSVGString({ useViewBox: true });
  } finally {
    printable.dispose();
  }
}
