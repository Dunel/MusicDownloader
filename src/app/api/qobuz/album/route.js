import ModuleInterface from "@/services/qobuz/moduleinterface";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const albumId = searchParams.get("albumId");

    if (!albumId) {
      return new Response(JSON.stringify({ error: "albumId is required" }), {
        status: 400,
      });
    }

    const moduleInterface = new ModuleInterface();
    await moduleInterface.login();

    const albumInfo = await moduleInterface.getAlbumInfo(albumId);
    return new Response(JSON.stringify(albumInfo), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error processing request:", error);
    return new Response(JSON.stringify({ error: "Error processing request" }), {
      status: 500,
    });
  }
}
