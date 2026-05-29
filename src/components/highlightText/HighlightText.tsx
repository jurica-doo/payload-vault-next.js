type HighlightTextProps = {
  text: string;
  highlight: string;
};

export const HighlightText = ({ text, highlight }: HighlightTextProps) => {
  if (!highlight.trim()) return <>{text}</>;

  const regex = new RegExp(`(${highlight})`, "gi");
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        regex.test(part) ? (
          <mark key={index} className="rounded bg-color-primary text-black">
            {part}
          </mark>
        ) : (
          <span key={index}>{part}</span>
        )
      )}
    </>
  );
};
