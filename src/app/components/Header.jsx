export default function Header({ title }) {
    return (
      <header className="bg-black-800">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-20">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            {title}
          </h1>
        </div>
      </header>
    );
  }