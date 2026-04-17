import PreviewView from "./preview-view";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <PreviewView projectId={projectId} />;
}
