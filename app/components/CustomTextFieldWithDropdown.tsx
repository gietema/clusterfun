import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAtomValue } from 'jotai';
import { uuidAtom } from '@/app/components/Previewer';
import { FilterInterface } from '../plots/models/FilterInterface';
import { API_URL } from '../plots/models/Constants';

interface CustomTextFieldWithDropdownProps {
  filter: FilterInterface;
  handleValueChange: (value: string[]) => void;
}

interface Option {
  label: string;
  count: number;
}

const CustomTextFieldWithDropdown: React.FC<CustomTextFieldWithDropdownProps> = ({ filter, handleValueChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const uuid = useAtomValue(uuidAtom);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevComparisonRef = useRef<string | null>(null);  // useRef to store previous comparison value
  const prevColumnRef = useRef<string | null>(null);  // useRef to store previous column value

  useEffect(() => {
    const prevComparison = prevComparisonRef.current;
    // reset value if selected operator changes from IN or NOT IN to something else
    if (filter.comparison !== null && (prevComparison === 'IN' || prevComparison === 'NOT IN') && filter.comparison !== 'IN' && filter.comparison !== 'NOT IN') {
      handleValueChange([]);
    }
    // Update the ref to the current comparison value
    prevComparisonRef.current = filter.comparison;
  }, [filter.comparison, handleValueChange]);

  useEffect(() => {
    // reset value if the column changes
    if (prevColumnRef.current !== null && prevColumnRef.current !== filter.column) {
      handleValueChange([]);
    }
    // Update the ref to the current column value
    prevColumnRef.current = filter.column;
  }, [filter.column, handleValueChange]);


  useEffect(() => {
    if (filter.column) {
      const fetchOptions = async () => {
        try {
          const response = await axios.get<Option[]>(`${API_URL}/views/${uuid}/columns/${filter.column}/values`);
          setOptions(response.data);
        } catch (error) {
          setOptions([]);
          console.error('Error fetching column values:', error);
        }
      };
      fetchOptions();
    }
  }, [filter.column, uuid]);

  useEffect(() => {
    // make sure the input value, even if not in the options, after isOpen is false, is used
    // this allows for custom values to be entered
    if (!isOpen && inputValue) {
      handleSelect(inputValue);
    }
  }, [isOpen, inputValue]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleSelect = (value: string) => {
    if (filter.comparison === 'IN' || filter.comparison === 'NOT IN') {
      if (!filter.values.includes(value)) {
        const newValues = [...filter.values, value];
        handleValueChange(newValues);
      }
    } else {
      handleValueChange([value]);
    }
    setInputValue('');
    setIsOpen(false);
  };

  const handleRemove = (value: string) => {
    const newValues = filter.values.filter(v => v !== value);
    handleValueChange(newValues);
  };

  return (
    <div className="relative inline-block w-full mb-2" ref={dropdownRef}>
      <input
        type="text"
        className="w-full bg-white border border-gray-300 text-gray-700 py-2 px-4 pr-8 rounded leading-tight focus:outline-none focus:ring-emerald-500 focus:border-emerald-500"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={() => setIsOpen(true)}
      />
      {isOpen && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {options.filter(option => option.label.includes(inputValue))
          // filter out already selected values
          .filter(option => !filter.values.includes(option.label))
          .map((option) => (
            <li
              key={option.label}
              onClick={() => handleSelect(option.label)}
              className="cursor-pointer px-4 py-2 hover:bg-gray-100"
            >
              {option.label} 
              <span className="bg-gray-100 rounded text-2xs text-gray-500 p-1 ml-2">{option.count}</span>
            </li>
          ))}
        </ul>
      )}
      {filter.values.length > 0 && (
        <div className="mt-2 flex flex-wrap">
          {filter.values.map(value => (
            <span key={value} className="bg-emerald-900 text-white py-1 px-2 rounded-full mr-2 mb-2 flex items-center">
              {value}
              <button onClick={() => handleRemove(value)} className="ml-2 text-sm">
                &times;
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};

export default CustomTextFieldWithDropdown;