export default function GridContainer({ children }) {
  return (
    <div className="bg-gray-800 p-6 md:p-10 rounded mb-8">
      <div className="flex flex-col gap-4">
        {children}
      </div>
    </div>
  );
}
