import Link from "next/link";

export default function Footer() {
  return (
    <div className="p-8">
      <div className="flex justify-center text-center">
        <div className="max-w-5xl">
          <h2 className="logo text-3xl text-white">Clusterfun</h2>
          <h3 className="logo pt-8 text-white">
            By{" "}
            <Link href="http://www.giete.ma" className="underline">
              Gietema
            </Link>
          </h3>
        </div>
      </div>
    </div>
  );
}
