import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center py-24 text-center">
      <Compass className="mb-3 h-9 w-9 text-zinc-300" />
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="mb-4 mt-1 text-zinc-500">The page you are looking for does not exist.</p>
      <Link to="/" className="btn-primary">Back to overview</Link>
    </div>
  );
}
