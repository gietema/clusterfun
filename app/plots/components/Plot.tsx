import PlotlyPlot, { PlotProps } from "@/app/plots/components/PlotlyPlot";

// export const DynamicPlot = dynamic(import("./PlotlyPlot"), {
//   ssr: false,
// });

export default function getPlot({
  revision,
  handleHover,
  handleClick,
  handleSelect,
}: PlotProps): JSX.Element {
  return (
    <PlotlyPlot
      revision={revision}
      handleHover={handleHover}
      handleClick={handleClick}
      handleSelect={handleSelect}
    />
  );
}
