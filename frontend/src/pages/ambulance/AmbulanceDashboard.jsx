import ServiceDashboard from '../../components/ServiceDashboard';
export default function AmbulanceDashboard() {
  return <ServiceDashboard entityKey="ambulance" apiBase="/ambulances" icon="🚑" title="Ambulance Driver Portal" />;
}
