"use client"; // This is a client component 👈🏽

import Link from "next/link";
import CodeBlock from "./components/Code";
import Footer from "./components/Footer";
import Navbar from "./components/Navbar";

export default function Home() {
  return (
    // create navbar with linsks to other pages, with tailwind
    <div>
      <Navbar />
      <div className="sm:text-md mx-auto min-h-body max-w-screen-lg p-4 text-sm lg:p-0 lg:p-4">
        <h1 className="pb-5 pt-8 text-center text-2xl font-bold text-white md:text-5xl">
          Explore data with one line of code
        </h1>
        <div className="text-white">
          <div className="">
            <div>
              Clusterfun is a python plotting library to explore data in your
              plots. <br />
              After installing clusterfun with{" "}
              <code>pip install clusterfun</code>, you can create the above plot
              locally, without any additional setup:
            </div>
            <div className="text-left">
              <CodeBlock>
                <pre className={"mb-0 pb-0"}>
                  {`import pandas as pd
import clusterfun as clt

df = pd.read_csv("https://raw.githubusercontent.com/gietema/clusterfun-data/main/wiki-art.csv")
clt.scatter(df, x="x", y="y", media="img_path", color="painter")`}
                </pre>
              </CodeBlock>
            </div>
            <div>Data can be hosted locally or on AWS S3.</div>
            <Link href="/documentation/installation" className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700">
              Documentation
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
