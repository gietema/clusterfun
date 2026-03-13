import type { InformationValue } from "@/app/types";

interface InformationItemProps {
  label: string;
  value: InformationValue;
}

export default function InformationItem({ label, value }: InformationItemProps) {
  return (
    <div className="pt-2">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <div className="text-sm text-gray-900">{value}</div>
    </div>
  );
}
