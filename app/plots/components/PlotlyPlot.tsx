import { configAtom, dataAtom } from "@/app/components/Previewer";
import { Config } from "@/app/plots/models/Config";
import { useAtomValue } from "jotai";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

export interface PlotProps {
  layout?: any;
  revision: number;
  handleHover: Function;
  handleClick: Function;
  handleSelect: Function;
}

const Plot = dynamic(async () => await import("react-plotly.js"), {
  ssr: false,
});

// eslint-disable-next-line react/display-name,import/no-anonymous-default-export
export default ({
  revision,
  handleHover,
  handleClick,
  handleSelect,
}: PlotProps): JSX.Element => {
  const config = useAtomValue(configAtom);
  const data = useAtomValue(dataAtom);

  if (config === undefined || data === undefined) {
    return <></>;
  }
  const [layout, setLayout] = useState<any>({
    hovermode: "closest",
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    xaxis: getXAxis(config),
    yaxis: {
      autorange: true,
      showgrid: true,
      showline: false,
      title: {
        text: config.y,
        font: {
          color: "black",
          size: 11,
          // size: window.innerWidth < 768 ? 10 : 12
        },
      },
    },
    displayModeBar: false,
    dragmode: "select",
    datarevision: revision,
    autosize: true,
    margin: {
      l: 40,
      r: 0,
      b: 40,
      t: 0,
      pad: 0,
    },
    // legend: {
    //   x: window.innerWidth < 768 ? 0.5 : undefined,
    //   xanchor: window.innerWidth < 768 ? 'center' : 'right',
    //   y: window.innerWidth < 768 ? 1.1 : undefined,
    //   yanchor: 'bottom',
    //   font: {
    //     color: 'black',
    //     size: window.innerWidth < 768 ? 10 : 12
    //   }
    // }
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    setLayout((prevState: any) => ({
      ...prevState,
      xaxis: getXAxis(config),
      yaxis: {
        ...prevState.yaxis,
        title: {
          text: config.y,
        },
      },
      datarevision: revision,
    }));
  }, [config, revision]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleResize = () => {
      setLayout((prevLayout: { legend: any }) => ({
        ...prevLayout,
        legend: {
          ...prevLayout.legend,
          x: window.innerWidth < 768 ? 0.5 : undefined,
          xanchor: window.innerWidth < 768 ? "center" : undefined,
          y: window.innerWidth < 768 ? 1.1 : undefined,
          yanchor: window.innerWidth < 768 ? "bottom" : undefined,
        },
      }));
    };

    handleResize();

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update the onRelayout event handler to update the layout state
  function onRelayout(e: any): void {
    if (
      e["xaxis.range[0]"] !== undefined &&
      e["xaxis.range[1]"] !== undefined &&
      e["yaxis.range[0]"] !== undefined &&
      e["yaxis.range[1]"] !== undefined
    ) {
      setLayout((prevState: { xaxis: any; yaxis: any }) => ({
        ...prevState,
        xaxis: {
          ...prevState.xaxis,
          range: [e["xaxis.range[0]"], e["xaxis.range[1]"]],
        },
        yaxis: {
          ...prevState.yaxis,
          range: [e["yaxis.range[0]"], e["yaxis.range[1]"]],
        },
      }));
    }
  }
  return (
    <>
      {isLoading && (
        <div
          className="h-100 flex-column flex items-center justify-center text-center"
          style={{ height: "477px" }}
        >
          <div role="status">
            <svg
              aria-hidden="true"
              className="mr-2 h-8 w-8 animate-spin fill-orange-500 text-gray-200 dark:text-gray-200"
              viewBox="0 0 100 101"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
                fill="currentColor"
              />
              <path
                d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
                fill="currentFill"
              />
            </svg>
            <span className="sr-only">Loading...</span>
          </div>
        </div>
      )}
      <Plot
        data={data}
        layout={layout}
        revision={revision}
        useResizeHandler={true}
        style={{ width: "100%", height: "100%" }}
        config={{ scrollZoom: true, displayModeBar: false }}
        onRelayout={(e: any) => onRelayout(e)}
        onInitialized={(figure: { layout: any }) => {
          setIsLoading(false);
        }}
        onHover={(e: { points: Array<{ pointIndex: string | number }> }) =>
          handleHover(
            // @ts-expect-error
            e.points?.[0].data.id[e.points[0].pointIndex],
          )
        }
        onClick={(e: { points: Array<{ pointIndex: string | number }> }) =>
          handleClick(
            // @ts-expect-error
            e.points?.[0].data.id[e.points[0].pointIndex],
          )
        }
        onSelected={(e: { points: any[] }) => {
          if (e?.points && e.points.length > 0) {
            const selectedIndices = e.points.map(
              // @ts-ignore
              (p) => data[p.curveNumber].id[p.pointIndex],
            );
            handleSelect(e.points && selectedIndices);
          }
        }}
      />
    </>
  );
};

function getXAxis(cfg: Config): object {
  if (cfg.type === "violin") {
    return {
      /* Set the placement of the first tick */
      tick0: 0,
      /* Set the step in-between ticks */
      dtick: 2,
      /* Specifies the maximum number of ticks */
      tickvals:
        cfg.colors != null &&
        Array.from({ length: cfg.colors.length }, (v, i) => i * 2),
      ticktext: cfg.colors,
      autorange: true,
    };
  }
  if (cfg.type == "bar_chart") {
    return {
      tick0: 0.35,
      dtick: 1,
      rotation: 0,
      // set the tickvals to the number of unique x values
      tickvals:
        cfg.x_names !== undefined &&
        Array.from({ length: cfg.x_names.length + 1 }, (v, i) => i + 0.35),
      ticktext: cfg.x_names,
      autorange: true,
      automargin: true,
    };
  }
  return {
    showgrid: true,
    showline: false,
    zeroline: false,
    title: {
      text: cfg.x,
      font: {
        color: "black",
        size: 11,
      },
    },
    autorange: true,
    automargin: true,
  };
}
