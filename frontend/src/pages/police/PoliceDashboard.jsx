import ServiceDashboard from '../../components/ServiceDashboard';
export default function PoliceDashboard() {
  return <ServiceDashboard entityKey="police" apiBase="/police/station" icon="🚔" title="Police Station Portal" />;
}
