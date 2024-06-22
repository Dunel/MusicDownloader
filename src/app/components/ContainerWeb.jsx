export default function ContainerWeb({ children }) {
    return (
      <main className="container mx-auto px-4 md:px-8 lg:px-20 py-8">
          {children}
      </main>
    );
  }