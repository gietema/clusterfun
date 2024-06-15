import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { IconDefinition } from "@fortawesome/free-solid-svg-icons";

interface ButtonWithIconProps {
  icon: IconDefinition;
  text?: string;
  onClick: () => void;
  hidden?: boolean;
  reverse?: boolean;
}

const ButtonWithIcon = ({ icon, text, onClick, hidden = false, reverse = false }: ButtonWithIconProps) => (
  <button
    onClick={onClick}
    className={`hover:text-blue-500 ${hidden ? "hidden" : "cursor-pointer"} flex items-center ${reverse ? "flex-row-reverse" : ""}`}
  >
    {text && <span className={`${reverse ? "ml-1" : "mr-1"}`}>{text}</span>}
    <FontAwesomeIcon icon={icon} />
  </button>
);

export default ButtonWithIcon;
