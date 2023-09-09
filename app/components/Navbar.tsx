"use client";
import { faGithub } from "@fortawesome/free-brands-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import Link from "next/link";
import React from "react";

export default function Navbar() {
  const [showNavbar, setShowNavbar] = React.useState(false);

  return (
    <nav className="border-gray-200">
      <div className="mx-auto flex max-w-screen-xl flex-wrap items-center justify-between p-0 lg:p-4">
        <div className="flex items-center">
          <div className="self-center whitespace-nowrap text-2xl font-semibold text-white">
            <Link
              href="/#"
              className="logo ps-4 pt-4 text-sm sm:text-lg lg:p-0"
            >
              <span className="dancing-text">C</span>
              <span className="dancing-text">l</span>
              <span className="dancing-text">u</span>
              <span className="dancing-text">s</span>
              <span className="dancing-text">t</span>
              <span className="dancing-text">e</span>
              <span className="dancing-text">r</span>
              <span className="dancing-text">f</span>
              <span className="dancing-text">u</span>
              <span className="dancing-text">n</span>
            </Link>
          </div>
        </div>
        <button
          data-collapse-toggle="navbar-default"
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg p-2 text-sm text-white hover:bg-gray-700 focus:outline-none focus:ring-2  focus:ring-gray-600 md:hidden"
          aria-controls="navbar-default"
          aria-expanded="false"
          onClick={() => setShowNavbar(!showNavbar)}
        >
          <span className="sr-only">Open main menu</span>
          <svg
            className="h-5 w-5"
            aria-hidden="true"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 17 14"
          >
            <path
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M1 1h15M1 7h15M1 13h15"
            />
          </svg>
        </button>
        <div
          className={`${!showNavbar && "hidden"} w-full md:block md:w-auto`}
          id="navbar-default"
        >
          <ul className="mt-4 flex flex-col rounded-lg border  border-gray-700 p-4 font-medium  md:mt-0 md:flex-row md:space-x-8 md:border-0 lg:p-0">
            <li>
              <Link
                href="/documentation/getting-started"
                className="block rounded py-2 pl-3 pr-4  text-white hover:bg-gray-700 hover:text-white md:border-0 md:p-0 md:hover:bg-transparent md:hover:text-blue-700"
              >
                Documentation
              </Link>
            </li>
            <li>
              <Link
                className="block rounded py-2 pl-3 pr-4 text-white hover:bg-gray-700 hover:text-white md:border-0 md:p-0 md:hover:bg-transparent md:hover:text-blue-700"
                href="/about"
              >
                About
              </Link>
            </li>
            <li>
              <Link
                className="block rounded py-2 pl-3 pr-4 text-white hover:bg-gray-700 hover:text-white md:border-0 md:p-0 md:hover:bg-transparent md:hover:text-blue-700"
                href="https://github.com/gietema/clusterfun"
              >
                <FontAwesomeIcon className="mx-2" icon={faGithub} />
                GitHub
              </Link>
            </li>
          </ul>
        </div>
      </div>
    </nav>
  );
}
