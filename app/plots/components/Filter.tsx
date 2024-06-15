import CustomDropdown from '@/app/components/CustomDropdown';
import CustomTextFieldWithDropdown from '@/app/components/CustomTextFieldWithDropdown';

interface FilterProps {
  filter: { column: string; comparison: string; values: string[] };
  columns: { value: string; label: string; dtype: string }[];
  onFilterChange: (filter: { column: string; comparison: string; values: string[] }) => void;
  onRemove: () => void;
}

const Filter: React.FC<FilterProps> = ({ filter, columns, onFilterChange, onRemove }) => {
  const handleColumnChange = (value: string) => {
    onFilterChange({ column: value ?? '', comparison: filter.comparison ?? '', values: filter.values });
  };

  const handleOperatorChange = (value: string) => {
    onFilterChange({ column: filter.column ?? '', comparison: value ?? '', values: filter.values });
  };

  const handleValueChange = (values: string[]) => {
    onFilterChange({ column: filter.column ?? '', comparison: filter.comparison ?? '', values });
  };

  const operatorOptions = [
    { value: '=', label: '=' },
    { value: '!=', label: '≠' },
    { value: '>=', label: '≥' },
    { value: '<=', label: '≤' },
    { value: 'IN', label: 'IN' },
    { value: 'NOT IN', label: 'NOT IN' }
  ];

  return (
    <div className="px-2 text-xs border rounded mb-2">
      <div className="w-full text-right">
      <button onClick={onRemove} className="text-red-500 text-right">&times;</button>
      </div>
      <div className="flex w-full">
        <div className="flex-grow me-1">
        <CustomDropdown
            options={columns}
            selectedOption={filter.column}
            handleDropdownChange={handleColumnChange}
        />
        </div>
        <div className="flex-grow">
            <CustomDropdown
                options={operatorOptions}
                selectedOption={filter.comparison}
                handleDropdownChange={handleOperatorChange}
            />
        </div>
        <div className="flex-grow ms-1">
        <CustomTextFieldWithDropdown
            filter={filter}
            handleValueChange={handleValueChange}
        /> 
        </div>
      </div>
    </div>
  );
};

export default Filter;