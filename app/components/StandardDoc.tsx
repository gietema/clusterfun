export default function StandardDoc({
  color,
  media,
}: {
  color?: boolean | undefined;
  media?: boolean | undefined;
}): JSX.Element {
  return (
    <>
      {media === true && (
        <li>
          <code>media: str</code>
          <br />
          The column name of the media to display
        </li>
      )}
      {color === true && (
        <li>
          <code>color: Optional[str] = None</code>
          <br />
          Optional column name to color points according to the value in the
          column
        </li>
      )}
      <li>
        <code>bounding_box: Optional[str] = None</code>
        <br />
        Optional column to draw bounding boxes on top of the media. The bounding
        boxes should be a dictionary or an array of dictionaries of type:
        <ul>
          <li>
            <code>xmin: Union[float, int]</code>
          </li>
          <li>
            <code>ymin: Union[float, int]</code>
          </li>
          <li>
            <code>xmax: Union[float, int]</code>
          </li>
          <li>
            <code>ymax: Union[float, int]</code>
          </li>
          <li>
            <code>label: Optional[str] = None</code>
          </li>
          <li>
            <code>color: Optional[str] = None</code>
          </li>
        </ul>
        If no color is provided, a default color scheme will be used.
        <br />
        The label will be displayed in the top left of the bounding box
      </li>
      <li>
        <code>title: Optional[str] = None</code>
        <br />
        The title to use for the plot.
      </li>
      <li>
        <code>show: bool = True</code>
        <br />
        Whether to show the plot or not. If show is set to <code>True</code>, we
        will start a local server to display the plot in a web browser. <br />
        More specifically, we start a FastAPI server where we mount the webpage
        as a static file. <br />
        The application itself does not require an internet connection. All data
        is loaded locally and does not leave your machine/browser. <br />
        If show is set to <code>False</code>, we only save the required data to
        serve the plot later on and return the path to where the data is stored.{" "}
        <br />
        If you want to serve the plot yourself later on, you can run{" "}
        <code>clusterfun serve &#123;path-to-data&#125;|&#123;uuid&#125;</code>
        &nbsp;in the command line to start a local server for the plot you are
        interested in.
      </li>
    </>
  );
}
