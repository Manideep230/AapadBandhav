import ServiceDashboard from '../../components/ServiceDashboard';

export default function PoliceDashboard() {
  return <ServiceDashboard entityKey="police" apiBase="/police/station" title="Police Station Portal" />;
}
