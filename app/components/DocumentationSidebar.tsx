"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function DocumentationSidebar() {
  const pathname = usePathname();
  const [showSidebar, setShowSidebar] = useState(false);

  function toggleSidebar() {
    setShowSidebar(!showSidebar);
  }

  return (
    <>
      <button
        onClick={() => toggleSidebar()}
        data-drawer-target="sidebar-multi-level-sidebar"
        data-drawer-toggle="sidebar-multi-level-sidebar"
        aria-controls="sidebar-multi-level-sidebar"
        type="button"
        className="ml-3 mt-2 inline-flex items-center rounded-lg p-2 text-sm text-gray-400 hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-200 sm:hidden"
      >
        <span className="sr-only">Open sidebar</span>
        <svg
          className="h-6 w-6"
          aria-hidden="true"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            clipRule="evenodd"
            fillRule="evenodd"
            d="M2 4.75A.75.75 0 012.75 4h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 4.75zm0 10.5a.75.75 0 01.75-.75h7.5a.75.75 0 010 1.5h-7.5a.75.75 0 01-.75-.75zM2 10a.75.75 0 01.75-.75h14.5a.75.75 0 010 1.5H2.75A.75.75 0 012 10z"
          ></path>
        </svg>
      </button>
      <aside
        id="sidebar-multi-level-sidebar"
        className={`fixed top-20 z-40 w-64  -translate-x-full transition-transform ${
          showSidebar ? "translate-x-0 bg-gray-800" : "sm:translate-x-0"
        }`}
        aria-label="Sidebar"
      >
        <div className="overflow-y-auto border-r-4 border-gray-800 px-3 py-4 ">
          <ul className="space-y-2 font-medium">
            <li>
              <Link
                href="/documentation/getting-started"
                className="group flex items-center rounded-lg p-2 text-white transition-all duration-300 hover:bg-gray-700"
              >
                <div
                  className={`ml-3 ${
                    pathname == "/documentation/getting-started"
                      ? "text-green-500"
                      : ""
                  }`}
                >
                  Getting started
                </div>
              </Link>
            </li>
            <li>
              <Link
                href="/documentation/default-parameters"
                className="group flex items-center rounded-lg p-2  text-white transition-all duration-300 hover:bg-gray-700"
              >
                <span
                  className={`ml-3 flex-1 whitespace-nowrap ${
                    pathname == "/documentation/default-parameters"
                      ? "text-green-500"
                      : ""
                  }`}
                >
                  Default parameters
                </span>
              </Link>
            </li>
            <li>
              <Link
                href="/documentation/plot-types"
                type="button"
                className="group flex w-full items-center rounded-lg p-2 text-white transition  duration-75 hover:bg-gray-700"
                aria-controls="dropdown-example"
                data-collapse-toggle="dropdown-example"
              >
                <div
                  className={`ml-3 flex-1 whitespace-nowrap text-left ${
                    pathname == "/documentation/plot-types"
                      ? "text-green-500"
                      : ""
                  }`}
                >
                  Plot types
                </div>
              </Link>
              <ul id="dropdown-example" className="space-y-2 py-2">
                <li>
                  <a
                    href="/documentation/plot-types/histogram"
                    className={`group flex w-full items-center rounded-lg p-2 pl-11 transition duration-75 hover:bg-gray-700 
                                        ${
                                          pathname ==
                                          "/documentation/plot-types/histogram"
                                            ? "text-green-500"
                                            : "text-white"
                                        }`}
                  >
                    Histogram
                  </a>
                </li>
                <li>
                  <a
                    href="/documentation/plot-types/scatterplot"
                    className={`group flex w-full items-center rounded-lg p-2 pl-11 transition duration-75 hover:bg-gray-700 
                                        ${
                                          pathname ==
                                          "/documentation/plot-types/scatterplot"
                                            ? "text-green-500"
                                            : "text-white"
                                        }`}
                  >
                    Scatterplot
                  </a>
                </li>
                <li>
                  <a
                    href="/documentation/plot-types/violin-plot"
                    className={`group flex w-full items-center rounded-lg p-2 pl-11 transition duration-75 hover:bg-gray-700 
                                        ${
                                          pathname ==
                                          "/documentation/plot-types/violin-plot"
                                            ? "text-green-500"
                                            : "text-white"
                                        }`}
                  >
                    Violin plot
                  </a>
                </li>
                <li>
                  <a
                    href="/documentation/plot-types/grid"
                    className={`group flex w-full items-center rounded-lg p-2 pl-11 transition duration-75 hover:bg-gray-700 
                                    ${
                                      pathname ==
                                      "/documentation/plot-types/grid"
                                        ? "text-green-500"
                                        : "text-white"
                                    }`}
                  >
                    Grid
                  </a>
                </li>
                <li>
                  <a
                    href="/documentation/plot-types/pie-chart"
                    className={`group flex w-full items-center rounded-lg p-2 pl-11 transition duration-75 hover:bg-gray-700 
                                        ${
                                          pathname ==
                                          "/documentation/plot-types/pie-chart"
                                            ? "text-green-500"
                                            : "text-white"
                                        }`}
                  >
                    Pie chart
                  </a>
                </li>
              </ul>
            </li>
            <li>
              <Link
                href="/documentation/data-loading"
                className="group flex items-center rounded-lg p-2 text-white transition-all  duration-300 hover:bg-gray-700"
              >
                <span
                  className={`ml-3 flex-1 whitespace-nowrap ${
                    pathname == "/documentation/data-loading"
                      ? "text-green-500"
                      : ""
                  }`}
                >
                  Data loading
                </span>
              </Link>
            </li>
          </ul>
        </div>
      </aside>
    </>
  );
}
