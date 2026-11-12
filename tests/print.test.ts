import { expect, it } from "vitest";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, DataZoomComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { renderChartForPrint } from "../src/lib/printChart";

echarts.use([LineChart, GridComponent, DataZoomComponent, SVGRenderer]);
it("renders a scalable print copy without resizing or changing the screen chart", () => {
  const screen = echarts.init(null, undefined, {
    renderer: "svg",
    ssr: true,
    width: 390,
    height: 300,
  });
  try {
    screen.setOption({
      xAxis: { type: "value" },
      yAxis: { type: "value" },
      dataZoom: [{ type: "slider", show: true }],
      series: [
        {
          type: "line",
          connectNulls: false,
          data: [
            [0, 100],
            [5, 110],
            [10, null],
            [30, 105],
          ],
        },
      ],
    });
    const options = screen.getOption();
    const svg = renderChartForPrint(options, 300);
    expect(svg).toContain('viewBox="0 0 700 300"');
    expect(svg).toContain("<path");
    expect(screen.getWidth()).toBe(390);
    expect((options.dataZoom as any[])[0].show).toBe(true);
  } finally {
    screen.dispose();
  }
});
