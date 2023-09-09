import dynamic from "next/dynamic";

const DynamicCodeBlock = dynamic(async () => await import("./Code"), {
  ssr: false,
});

export default DynamicCodeBlock;
