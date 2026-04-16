import CustomizeView from "./customize-view";

export default async function CustomizePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CustomizeView draftId={id} />;
}
