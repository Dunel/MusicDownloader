export default function ColRight({ children }) {
    return (
      <div className="md:col-span-1">
        <div className="bg-white p-6 rounded">
          {children}
        </div>
      </div>
    );
  }