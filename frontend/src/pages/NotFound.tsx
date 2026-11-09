import { Link } from 'react-router-dom';

export function NotFoundPage() {
  return (
    <div className="card">
      <div className="card-body center-msg">
        Nie ma takiej strony. <Link to="/">Wróć do pulpitu</Link>
      </div>
    </div>
  );
}
