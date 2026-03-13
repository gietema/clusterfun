import type { InformationValue } from "@/app/types";

interface InformationItemProps {
  label: string;
  value: InformationValue;
}

export default function InformationItem({ label, value }: InformationItemProps) {
  return (
    <div>
      <div className="border-b border-gray-300 text-gray-800">
        <small>{label}</small>
      </div>
      <div>
        <small className="text-gray-800">{value}</small>
      </div>
    </div>
  );
}
