export default function BackButton (props: { back: Function }): JSX.Element {
  return (
    <button className="btn btn-secondary btn-sm" onClick={() => props.back()}>
      Back
    </button>
  )
}
