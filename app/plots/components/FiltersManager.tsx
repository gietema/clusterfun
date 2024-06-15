// components/FiltersManager.tsx
import { useEffect, useState } from 'react';
import axios from 'axios';
import { API_URL } from '../models/Constants';
import { useAtom, useAtomValue } from 'jotai';
import { filtersAtom, uuidAtom } from '@/app/components/Previewer';
import Filter from './Filter';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter } from '@fortawesome/free-solid-svg-icons';

interface ColumnInfo {
  name: string;
  dtype: string;
}

const FiltersManager: React.FC = () => {
  const [showFilters, setShowFilters] = useState(false);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [filters, setFilters] = useAtom(filtersAtom);
  const uuid = useAtomValue(uuidAtom);

  useEffect(() => {
    console.log('Fetching columns...');
    const fetchColumns = async () => {
      try {
        const response = await axios.get<ColumnInfo[]>(`${API_URL}/views/${uuid}/columns`);
        console.log('Columns:', response.data);
        setColumns(response.data);
      } catch (error) {
        console.error('Error fetching columns:', error);
      }
    };
    fetchColumns();
  }, []);

  const addFilter = () => {
    setShowFilters(true);
    setFilters([...filters, { column: '', comparison: '', values: [] }]);
  };

  const updateFilter = (index: number, filter: { column: string; comparison: string; values: string[] }) => {
    const newFilters = filters.slice();
    newFilters[index] = filter;
    setFilters(newFilters);
  };

  const removeFilter = (index: number) => {
    const newFilters = filters.slice();
    newFilters.splice(index, 1);
    setFilters(newFilters);
  };

  const columnOptions = columns.map(col => ({ value: col.name, label: col.name, dtype: col.dtype }));

  return (
    <div className="container mx-auto p-4 pe-0 pt-0">
      <div className={`flex flex-col ${showFilters ? "" : "hidden"}`}>
        {filters.map((filter, index) => (
            <Filter
              filter={filter}
              key={index}
              columns={columnOptions}
              onFilterChange={filter => updateFilter(index, filter)}
              onRemove={() => removeFilter(index)}
            />
        ))}
      </div>
      <div className="text-right">
      {(filters.length > 0 && showFilters) && (
        <button className="bg-emerald-900 text-white py-2 px-3 rounded
        hover:bg-emerald-500 focus:outline-none focus:ring focus:ring-emerald-500 focus:ring-opacity-50
            transition duration-300 ease-in-out text-xs
        "
        onClick={addFilter}
        >
          +
      </button> 
      )}
      <button onClick={() => {
        setShowFilters(!showFilters)
        filters.length === 0 && addFilter()
      }} className={`text-white py-2 px-3 rounded
        focus:outline-none focus:ring focus:ring-emerald-500 focus:ring-opacity-50
          transition duration-300 ease-in-out text-xs ms-1 ${showFilters ? 'bg-emerald-500 hover:bg-emerald-900' : 'bg-emerald-900 hover:bg-emerald-500'}`}>
        <><FontAwesomeIcon icon={faFilter} /> <span className="ms-1">Filters
            {filters.length > 0 && ` (${filters.length})`}
          </span></>
      </button>
      </div>
    </div>
  );
};

export default FiltersManager;