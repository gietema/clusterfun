import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
});

// Mock next/dynamic to just render the component directly
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<any>) => {
    let Component: any = null;
    loader().then((mod: any) => {
      Component = mod.default || mod;
    });
    return function DynamicComponent(props: any) {
      if (!Component) return null;
      return Component(props);
    };
  },
}));

// Mock FontAwesome to avoid SVG core dependency issues in jsdom
vi.mock("@fortawesome/react-fontawesome", () => ({
  FontAwesomeIcon: () => null,
}));
