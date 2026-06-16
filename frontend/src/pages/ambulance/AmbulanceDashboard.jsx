import ServiceDashboard from '../../components/ServiceDashboard';

export default function AmbulanceDashboard() {
  return <ServiceDashboard entityKey="ambulance" apiBase="/ambulances" title="Ambulance Driver Portal" />;
}
