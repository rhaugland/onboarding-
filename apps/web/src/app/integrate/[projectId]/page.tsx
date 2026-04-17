import IntegrateView from "./integrate-view";

export default async function IntegratePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <IntegrateView projectId={projectId} />;
}
