import { Config } from '../models/Config'
import { useEffect, useState } from 'react'
import { FilterInterface } from '../models/FilterInterface'
import { getFilteredPlotData } from '../requests/GetFilteredPlotData'

export function Filter (props: {
  cfg: Config
  uuid: string
  handleFilterData: Function
}): JSX.Element {
  const [filters, setFilters] = useState<FilterInterface[] | undefined>(
    undefined
  )
  const [selectedColumn, setSelectedColumn] = useState<string>()
  const [selectedComparison, setSelectedComparison] = useState<string>()
  const [selectedValue, setSelectedValue] = useState<string>()

  useEffect(() => {
    handleFiltering()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  function handleFiltering (): void {
    if (props.uuid === '' || filters === undefined) {
      return
    }
    getFilteredPlotData(props.uuid, filters)
      .then((data) => {
        props.handleFilterData(data)
      })
      .catch((e) => console.log(e))
  }

  function handleAddFilter (): void {
    if (
      selectedValue != null &&
      selectedComparison != null &&
      selectedColumn != null
    ) {
      const newFilter: FilterInterface = {
        column: selectedColumn,
        comparison: selectedComparison,
        value: selectedValue
      }
      const currentFilters = (filters !== null && filters !== undefined) ? filters : []
      // if new filter is already in currentFilters, do nothing
      if (currentFilters?.filter((f: FilterInterface) => f === newFilter).length > 0) {
        return
      }
      setFilters([...currentFilters, newFilter])
    }
  }

  function handleRemoveFilter (selectedFilter: FilterInterface): void {
    if (filters == null) {
      return
    }
    setFilters(filters.filter((filter) => filter !== selectedFilter))
  }

  return (
    <div>
      <div className="row">
        <div className="col-12 mb-2">
          {filters?.map((filter: FilterInterface) => {
            return (
              <div
                className="float-start p-1"
                key={`${filter.column}${filter.comparison}${filter.value}`}
              >
                <div
                  className="btn-group btn-group-sm"
                  role="group"
                  aria-label="Basic outlined example"
                >
                  <button type="button" className="btn btn-outline-secondary">
                    {filter.column} {filter.comparison} {filter.value}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleRemoveFilter(filter)}
                  >
                    <i className="bi bi-x"></i>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
        <div className="col-12">
          <div className="input-group input-group-sm ps-1">
            <select
              className="form-select"
              defaultValue={''}
              aria-label="Default select example"
              onChange={(e) => setSelectedColumn(e.target.value)}
            >
              <option value="" disabled={true}>
                Column
              </option>
              {props.cfg.columns
                .slice(2)
                .filter((c: string) => c !== '_y')
                .map((column: string) => {
                  return (
                    <option key={column} value={column}>
                      {column}
                    </option>
                  )
                })}
              {/* {(props.cfg.bounding_box) && ( */}
              {/*    <> */}
              {/*        <option value={`${props.cfg.bounding_box}.xmin`}>{`${props.cfg.bounding_box}.xmin`}</option> */}
              {/*        <option value={`${props.cfg.bounding_box}.ymin`}>{`${props.cfg.bounding_box}.ymin`}</option> */}
              {/*        <option value={`${props.cfg.bounding_box}.xmax`}>{`${props.cfg.bounding_box}.xmax`}</option> */}
              {/*        <option value={`${props.cfg.bounding_box}.ymax`}>{`${props.cfg.bounding_box}.ymax`}</option> */}
              {/*        <option value={`${props.cfg.bounding_box}.label`}>{`${props.cfg.bounding_box}.label`}</option> */}
              {/*    </> */}
              {/* )} */}
            </select>
            <select
              name=""
              id=""
              defaultValue={''}
              className="form-select"
              onChange={(e) => setSelectedComparison(e.target.value)}
            >
              <option value="">comparison</option>
              <option value=">">&gt;</option>
              <option value="<">&lt;</option>
              <option value="=">=</option>
              <option value="!=">&ne;</option>
            </select>
            <input
              type="text"
              aria-label="Last name"
              className="form-control"
              onChange={(e) => setSelectedValue(e.target.value)}
            />
            <button
              className="btn btn-outline-secondary"
              type="button"
              id="button-addon2"
              onClick={handleAddFilter}
            >
              Filter
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
