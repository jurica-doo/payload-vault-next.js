export const PageSkeletonLoader = () => {
  return (
    <div className="flex flex-col mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8 gap-10 pb-25">
      <div className="w-2/5 h-12 bg-color-primary/20 rounded-md animate-pulse"></div>

      {Array.from({ length: 6 }).map((_, idx) => (
        <div
          key={idx}
          className="bg-color-bg-card rounded-md p-4 flex flex-col gap-2 animate-pulse"
        >
          <div className="w-3/5 h-6 bg-color-bg-dark rounded-sm"></div>
          <div className="w-full h-4 bg-color-bg-dark rounded-sm"></div>
          <div className="w-7/10 h-4 bg-color-bg-dark rounded-sm"></div>
        </div>
      ))}
    </div>
  );
};
