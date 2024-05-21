"use client"; // This is a client component 👈🏽
import { Provider } from "jotai";
import Previewer from "./components/Previewer";
import { Toaster } from "react-hot-toast";

const ErrorView = ({ clearError }: { clearError: () => void }) => (
  <div className="flex h-screen items-center justify-center  text-center text-white">
    <div>
      <div className="text-xl">Something went wrong</div>
      <button
        className="mt-4 rounded bg-blue-500 px-4 py-2  text-white hover:bg-blue-700"
        onClick={clearError}
      >
        Refresh
      </button>
    </div>
  </div>
);

export default function Home() {
  return (
    <Provider>
      <Toaster/>
      <div className="m-2">
        <Previewer
          uuidProp={
            process.env.NODE_ENV === "production" &&
            process.env.BASE_URL === "https://clusterfun.app"
              ? "8e6e40d8-8df2-44d6-b5a3-34594c50a504"
              : "recent"
          }
        ></Previewer>
      </div>
    </Provider>
  );
}
